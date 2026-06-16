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
router.post("/", upload.array("files", 6), async (req, res) => {
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

        const photoFields = { photo: null, photo_1: null, photo_2: null, photo_3: null, photo_4: null, photo_5: null };
        if (req.files && req.files.length > 0) {
            const filenames = await Promise.all(req.files.map(f => regist_file(f)));
            photoFields.photo = filenames[0] ?? null;
            for (let i = 1; i <= 5; i++) {
                photoFields[`photo_${i}`] = filenames[i] ?? null;
            }
        }

        const draft = parseInt(req.body.draft) === 1 ? 1 : 0;

        let quote = null;
        let quote_type = null;
        console.log(quote)
        // 인용은 실제로 등록(발행)되는 댓글에 대해서만 카운터를 증가시킨다.
        // 임시저장 댓글은 발행 시점(PUT /comment/:comment_id)에 등록한다.
        if (req.body.quote_num && draft === 0) {
            try {
                ({ quote, quote_type } = await regist_quote(trx, req));
            } catch (err) {
                await trx.rollback();
                console.error("인용 과정에서 문제가 발생했습니다");
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." })
            }
        }

        // 임시저장 댓글은 아직 "댓글"이 아니므로 게시글의 댓글 수에 반영하지 않는다.
        if (draft === 0) {
            await trx(targetTable).where(postColumn, post_num).increment("comment", 1);
        }
        const [comment_num] = await trx("comment").insert({
            type,
            post_num,
            subject,
            user_id: user.user_id,
            reported: 0,
            ...photoFields,
            quote,
            quote_type,
            draft
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
            comment_id: comment_num,
            draft,
            message: draft === 1 ? "댓글이 임시저장되었습니다." : "댓글이 등록되었습니다."
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
            // 내가 차단한 사람이 쓴 댓글은 제외
            .whereNotIn("profile.id", function () {
                this.select("blocked_user_id").from("block_list").where({ user_id: id, type: 0 });
            })
            // 나를 차단한 사람이 쓴 댓글도 제외
            .whereNotIn("profile.id", function () {
                this.select("user_id").from("block_list").where({ blocked_user_id: id, type: 0 });
            })
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
                "photo_1",
                "photo_2",
                "photo_3",
                "photo_4",
                "photo_5",
                "vote",
                knex.raw("(`like` * 2 + quote_num * 3.5 + bookmarks * 2) AS popularity"),
                ...islikeandbookmark(id, "comment", 2) // 가상의 Column
            )
            // 임시저장 댓글은 다른 사람에게 보이지 않아야 하므로 목록에서 제외한다.
            // (작성자 본인의 임시저장 댓글은 GET /comment/drafts 로 별도 조회)
            .where({ type, post_num, "p.draft": 0 });

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

// 내 임시저장 댓글 목록 조회 (이어쓰기용)
// GET /comment/drafts?type=&post_num=  (둘 다 생략 가능, 내 임시저장 댓글 전체 조회)
// 주의: 이 라우트는 아래의 "/:comment_id" 라우트보다 먼저 선언되어야 한다 (그렇지 않으면 "drafts"가 comment_id로 매칭됨).
router.get("/drafts", async (req, res) => {
    try {
        const id = await define_id(req.headers.authorization, res);
        if (!id) {
            return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
        }
        const user = await knex("profile").where("id", id).select("user_id").first();
        if (!user) {
            return res.status(404).json({ success: false, message: "프로필을 찾을 수 없습니다." });
        }
        const page = parseInt(req.query.page) || 0;
        const filter = { "p.user_id": user.user_id, "p.draft": 1 };
        if (req.query.type !== undefined && !isNaN(parseInt(req.query.type))) {
            filter.type = parseInt(req.query.type);
        }
        if (req.query.post_num !== undefined && !isNaN(parseInt(req.query.post_num))) {
            filter.post_num = parseInt(req.query.post_num);
        }

        // 본인 소유의 draft만 조회 (다른 사람의 임시저장은 절대 노출하지 않음)
        const drafts = await knex("comment as p")
            .where(filter)
            .select("p.*", "p.comment_num as comment_id")
            .orderBy("p.timestamp", "desc")
            .limit(10)
            .offset(page * 10);

        return res.json({ success: true, drafts });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 댓글 단건 조회
router.get("/:comment_id", async (req, res) => {
    try {
        let id = null;
        if (req.headers.authorization) {
            id = await define_id(req.headers.authorization, res);
        }
        const comment_id = parseInt(req.params.comment_id);

        if (isNaN(comment_id)) {
            return res.status(400).json({
                success: false,
                message: "유효하지 않은 comment_id입니다."
            });
        }

        const comment = await knex("comment as p")
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
                "photo_1",
                "photo_2",
                "photo_3",
                "photo_4",
                "photo_5",
                "vote",
                "p.draft as draft",
                ...islikeandbookmark(id, "comment", 2)
            )
            .where("comment_num", comment_id)
            .first();

        // 임시저장 댓글은 작성자 본인에게만 노출한다.
        const ownerId = comment ? await user_id_to_id(comment.user_id) : null;
        if (!comment || (comment.draft == 1 && ownerId !== id)) {
            return res.status(404).json({
                success: false,
                message: "해당 댓글이 존재하지 않습니다."
            });
        }

        return res.json({
            success: true,
            comment
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "댓글 조회 중 서버 오류가 발생했습니다."
        });
    }
});

// 임시저장 댓글 수정 / 발행 (이어쓰기)
// body.draft 가 0이면 발행, 그 외(생략 포함)에는 임시저장 상태를 유지한다.
router.put("/:comment_id", upload.array("files", 6), async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    if (!id) {
        return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const comment_id = parseInt(req.params.comment_id);
    if (isNaN(comment_id)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 comment_id입니다." });
    }

    const trx = await knex.transaction();
    try {
        const existing = await trx("comment").where("comment_num", comment_id).first();
        if (!existing) {
            await trx.rollback();
            return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
        }
        const writerId = await user_id_to_id(existing.user_id);
        if (writerId !== id) {
            await trx.rollback();
            return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
        }
        // 이미 등록(발행)된 댓글은 이 엔드포인트로 수정할 수 없다 (임시저장 이어쓰기 전용).
        if (existing.draft != 1) {
            await trx.rollback();
            return res.status(409).json({ success: false, message: "이미 등록된 댓글은 이어쓰기로 수정할 수 없습니다." });
        }

        const { subject } = req.body;
        if (!subject) {
            await trx.rollback();
            return res.status(400).json({ success: false, message: "subject는 필수입니다." });
        }
        const newDraft = (req.body.draft === undefined) ? 1 : (parseInt(req.body.draft) === 1 ? 1 : 0);

        const updateFields = { subject };

        if (req.files && req.files.length > 0) {
            const filenames = await Promise.all(req.files.map(f => regist_file(f)));
            updateFields.photo = filenames[0] ?? null;
            for (let i = 1; i <= 5; i++) {
                updateFields[`photo_${i}`] = filenames[i] ?? null;
            }
        }

        // 인용은 발행 시점에만 등록한다 (draft 상태에서는 카운터를 증가시키지 않음).
        if (req.body.quote_num && newDraft === 0 && !existing.quote) {
            try {
                const { quote, quote_type } = await regist_quote(trx, req);
                updateFields.quote = quote;
                updateFields.quote_type = quote_type;
            } catch (err) {
                await trx.rollback();
                console.error("인용 과정에서 문제가 발생했습니다");
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." });
            }
        }

        // 투표가 아직 등록되지 않은 경우에만 새로 등록한다 (중복 등록 방지).
        if (req.body.vote && !existing.vote) {
            try {
                await regist_vote(trx, { vote: req.body.vote, post_type: 2, post_num: comment_id, table: "comment" });
            } catch (err) {
                await trx.rollback();
                const status = err.httpcode || 500;
                const message = err.message || "투표 등록 중 오류가 발생했습니다.";
                console.error(err);
                return res.status(status).json({ success: false, message });
            }
        }

        // draft -> 발행 전환 시점에만 게시글의 댓글 수를 1 증가시킨다 (생성 시점에 보류해 두었던 것).
        if (existing.draft == 1 && newDraft === 0) {
            const targetTable = existing.type === 0 ? "talk" : (existing.type === 1 ? "think" : "comment");
            const postColumn = existing.type === 0 ? "talk_num" : (existing.type === 1 ? "think_num" : "comment_num");
            await trx(targetTable).where(postColumn, existing.post_num).increment("comment", 1);
        }

        updateFields.draft = newDraft;
        await trx("comment").where("comment_num", comment_id).update(updateFields);
        await trx.commit();

        return res.json({
            success: true,
            message: newDraft === 0 ? "댓글이 등록되었습니다." : "임시저장이 갱신되었습니다."
        });
    } catch (err) {
        await trx.rollback();
        console.error(err);
        return res.status(500).json({ success: false, message: "댓글 수정 중 서버 오류가 발생했습니다." });
    }
});

router.delete("/:comment_id", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    const comment_data = await knex("comment").select("user_id", "type", "post_num", "draft").where("comment_num", req.params.comment_id).first();
    if (!comment_data) {
        return res.status(404).json({ "msg": "댓글을 찾을 수 없습니다", "success": 0 });
    }
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
        // 임시저장 상태였던 댓글은 댓글 수에 반영된 적이 없으므로 감소시키지 않는다.
        if (comment_data.draft == 0) {
            await knex(TargetTable).where(postColumn, comment_data.post_num).decrement("comment", 1);
        }
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
