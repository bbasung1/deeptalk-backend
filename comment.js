const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, user_id_to_id } = require('./general.js');

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
router.post("/", async (req, res) => {
    const { user_id, type, post_num, subject } = req.body;

    if (!user_id || type === undefined || post_num === undefined || !subject) {
        return res.status(400).json({
            success: false,
            message: "user_id, type, post_num, subject 모두 필요합니다."
        });
    }

    if (![0, 1].includes(type)) {
        return res.status(400).json({
            success: false,
            message: "type은 0(talk), 1(think) 중 하나여야 합니다."
        });
    }

    try {
        // 게시글 존재 여부 확인
        const targetTable = type === 0 ? "talk" : "think";
        const postColumn = type === 0 ? "talk_num" : "think_num";

        const post = await knex(targetTable)
            .where(postColumn, post_num)
            .select(knex.raw("1"))
            .first();

        if (!post) {
            return res.status(404).json({
                success: false,
                message: `해당 ${type === 0 ? "talk" : "think"} 게시글(post_num=${post_num})이 존재하지 않습니다.`
            });
        }

        // 댓글 작성자의 user_id 존재 확인 (profile 테이블에서)
        const user = await knex("profile")
            .where("user_id", user_id)
            .select(knex.raw("1"))
            .first();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "댓글 작성자 user_id가 존재하지 않습니다."
            });
        }

        // 댓글 삽입
        await knex("comment").insert({
            type,
            post_num,
            subject,
            user_id
        });

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
        const type = parseInt(req.query.type);
        const post_num = parseInt(req.query.post_num);
        const sort = req.query.sort || "latest";

        //  유효성 검사
        if (![0, 1].includes(type) || isNaN(post_num)) {
            return res.status(400).json({
                success: false,
                message: "유효하지 않은 type 또는 post_num입니다."
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
        const commentQuery = knex("comment")
            .select(
                "comment_id",
                "user_id",
                "subject",
                "likes",
                "quotes",
                "bookmarks",
                "timestamp",
                knex.raw("(likes * 2 + quotes * 3.5 + bookmarks * 2) AS popularity") // 가상의 Column
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
    const comment_data = await knex("comment").select("user_id").where("comment_id", req.params.comment_id).first();
    const comment_writer_id = await user_id_to_id(comment_data.user_id);
    if (id != comment_writer_id) {
        console.log(id);
        console.log(comment_data.user_id);
        return res.status(403).json({ "msg": "삭제 권한이 없습니다", "success": 0 })
    }
    try {
        await knex("comment").where("comment_id", req.params.comment_id).delete();
        return res.json({ "success": 1 })
    } catch {
        return res.status(500).json({ "success": 0, "msg": "삭제 과정에서 오류가 발생했습니다" });
    }
})

// 공용 업데이트 함수
async function updateCount(res, comment_id, field, increment) {
    try {
        // 먼저 현재 수치 확인
        const comment = await knex("comment").where("comment_id", comment_id).first();
        if (!comment) {
            return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
        }

        const currentValue = comment[field];
        const newValue = Math.max(0, currentValue + increment); // 0 미만 방지

        await knex("comment")
            .where("comment_id", comment_id)
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

// likes
router.patch("/:comment_id/likes/increase", (req, res) => {
    updateCount(res, req.params.comment_id, "likes", 1);
});
router.patch("/:comment_id/likes/decrease", (req, res) => {
    updateCount(res, req.params.comment_id, "likes", -1);
});

// quotes
router.patch("/:comment_id/quotes/increase", (req, res) => {
    updateCount(res, req.params.comment_id, "quotes", 1);
});
router.patch("/:comment_id/quotes/decrease", (req, res) => {
    updateCount(res, req.params.comment_id, "quotes", -1);
});

// bookmarks
router.patch("/:comment_id/bookmarks/increase", (req, res) => {
    updateCount(res, req.params.comment_id, "bookmarks", 1);
});
router.patch("/:comment_id/bookmarks/decrease", (req, res) => {
    updateCount(res, req.params.comment_id, "bookmarks", -1);
});


module.exports = router;
