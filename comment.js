const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, user_id_to_id, islikeandbookmark, regist_file, regist_quote, regist_vote } = require('./general.js');
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename } = require("./utils/imageSaver");
router.use(express.json());

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

// 댓글 작성하기
router.post("/", upload.single("file"), async (req, res) => {
    const type = parseInt(req.body.type);
    const post_num = parseInt(req.body.post_num);
    const { subject } = req.body;
    const our_id = await define_id(req.headers.authorization, res);
    console.log(req.body);
    console.log(our_id);
    console.log(type);
    console.log(post_num);
    console.log(subject);
    if (!our_id || isNaN(type) || isNaN(post_num) || !subject) {
        return res.status(400).json({
            success: false,
            message: "jwt_token, type, post_num, subject 모두 필요합니다."
        });
    }

    if (![0, 1, 2].includes(type)) {
        return res.status(400).json({
            success: false,
            message: "type은 0(talk), 1(think), 2(comment) 중 하나여야 합니다."
        });
    }
    const trx = await knex.transaction();
    try {

        // 게시글 존재 여부 확인
        const targetTable = type === 0 ? "talk" : (type === 1 ? "think" : "comment");
        const postColumn = type === 0 ? "talk_num" : (type === 1 ? "think_num" : "comment_num");

        const post = await knex(targetTable)
            .where(postColumn, post_num)
            .select(knex.raw("1"))
            .first();

        if (!post) {
            return res.status(404).json({
                success: false,
                message: `해당 ${type === 0 ? "talk" : (type === 1 ? "think" : "comment")} 게시글(post_num=${post_num})이 존재하지 않습니다.`
            });
        }

        // 댓글 작성자의 user_id 존재 확인 (profile 테이블에서)
        const user = await knex("profile")
            .where("id", our_id)
            .select("user_id")
            .first();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "댓글 작성자 user_id가 존재하지 않습니다."
            });
        }
        let filename = null;
        if (req.file) {
            filename = await regist_file(req.file);
        }
        let quote = null;
        let quote_type = null;
        console.log(quote)
        if (req.body.quote_num) {
            try {
                ({ quote, quote_type } = await regist_quote(trx, req));
            } catch (err) {
                await trx.rollback();
                console.error("인용 과정에서 문제가 발생했습니다");
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." })
            }
        }

        // 댓글 삽입
        await knex(targetTable).where(postColumn, post_num).increment("comment", 1);
        const [comment_num] = await trx("comment").insert({
            type,
            post_num,
            subject,
            user_id: user.user_id,
            reported: 0, // 기본값: 신고되지 않음
            photo: filename,
            quote,
            quote_type
        });
        if (req.body.vote) {
            try {
                await regist_vote(trx, { vote: req.body.vote, post_type: 2, post_num: comment_num, table: "comment" })
            } catch (err) {
                await trx.rollback();
                const status = err.httpcode || 500;
                const message = err.message || "투표 등록 중 오류가 발생했습니다.";
                console.error(err);
                return res.status(status).json({ success: false, message });
            }
        }
        await trx.commit();
        res.status(201).json({
            success: true,
            message: "댓글이 등록되었습니다."
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "댓글 등록 중 서버 오류가 발생했습니다."
        });
    }
});


// 댓글 불러오기

router.get("/", async (req, res) => {
    try {
        let id = null;
        if (req.headers.authorization) {
            id = await define_id(req.headers.authorization, res);
        }
        const type = parseInt(req.query.type);
        const post_num = parseInt(req.query.post_num);
        const page = parseInt(req.query.page) || 0;
        const sort = req.query.sort || "latest";

        //  유효성 검사
        if (![0, 1, 2].includes(type) || isNaN(post_num)) {
            return res.status(400).json({
                success: false,
                message: "유효하지 않은 type 또는 post_num입니다.",
            });
        }

        //  대상 테이블 결정
        const targetTable = type === 0 ? "talk" : "think";
        const postColumn = type === 0 ? "talk_num" : "think_num";

        //  게시글 존재 여부 확인
        const post = await knex(targetTable)
            .where(postColumn, post_num)
            .select(knex.raw("1"))
            .first();

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "해당 게시글이 존재하지 않습니다."
            });
        }
        //  댓글 쿼리 생성(준비)
        const commentQuery = knex("comment as p")
            .leftJoin("profile", "p.user_id", "profile.user_id")
            .select(
                "comment_num AS comment_id",
                "p.user_id as user_id",
                "subject",
                "like",
                "quote_num AS quotes",
                "bookmarks",
                "timestamp",
                "profile.nickname",
                "profile.image as profile_image",
                "photo",
                "vote",
                knex.raw("(`like` * 2 + quote_num * 3.5 + bookmarks * 2) AS popularity"),
                ...islikeandbookmark(id, "comment", 2) // 가상의 Column
            )
            .where({ type, post_num });

        //  정렬 조건 추가
        if (sort === "popular") {
            commentQuery
                .orderBy("popularity", "desc")      // 인기도 높은 순
                .orderBy("timestamp", "desc");      // 인기도 같으면 최신순
        } else {
            commentQuery.orderBy("timestamp", "desc"); // 최신순
        }
        commentQuery.limit(10).offset(page * 10); // 페이지당 10개 댓글

        //  Knex 쿼리를 실제로 실행해서 결과를 가져오는 코드
        const comments = await commentQuery;

        //  응답 반환
        return res.json({
            success: true,
            comment_count: comments.length,
            comments
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "댓글 조회 중 서버 오류가 발생했습니다."
        });
    }
});

router.delete("/:comment_id", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    const comment_data = await knex("comment").select("user_id", "type", "post_num").where("comment_num", req.params.comment_id).first();
    const comment_writer_id = await user_id_to_id(comment_data.user_id);
    if (id != comment_writer_id) {
        console.log(id);
        console.log(comment_data.user_id);
        return res.status(403).json({ "msg": "삭제 권한이 없습니다", "success": 0 })
    }
    try {
        const TargetTable = comment_data.type === 0 ? "talk" : "think";
        const postColumn = comment_data.type === 0 ? "talk_num" : "think_num";
        await knex("comment").where("comment_num", req.params.comment_id).delete();
        await knex(TargetTable).where(postColumn, comment_data.post_num).decrement("comment", 1);
        return res.json({ "success": 1 })
    } catch {
        return res.status(500).json({ "success": 0, "msg": "삭제 과정에서 오류가 발생했습니다" });
    }
})

// 공용 업데이트 함수
async function updateCount(res, comment_id, field, increment) {
    try {
        // 먼저 현재 수치 확인
        const comment = await knex("comment").where("comment_num", comment_id).first();
        if (!comment) {
            return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
        }

        const currentValue = comment[field];
        const newValue = Math.max(0, currentValue + increment); // 0 미만 방지

        await knex("comment")
            .where("comment_num", comment_id)
            .update({ [field]: newValue });

        return res.json({
            success: true,
            message: `${field} ${increment > 0 ? "증가" : "감소"} 완료`,
            [`new_${field}`]: newValue
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류" });
    }
}


module.exports = router;
