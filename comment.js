const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, user_id_to_id, islikeandbookmark, regist_file, regist_quote, regist_vote, add_nickname, getBlockedIds, extractMentionedIds, getOriginalPostWriterId } = require('./general.js');
const { sendReactionNotification, sendMentionNotification } = require('./fcm.js');
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
    const draft = req.body.draft ?? 0;
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
            message: "댓글이 등록되었습니다.",
            comment_num
        });

        // 게시물 작성자에게 반응 알림 발송 (응답 블로킹 방지를 위해 await 생략, talk/think에만 해당)
        const nickname = await add_nickname(our_id);
        if (targetTable === "talk" || targetTable === "think") {
            sendReactionNotification({
                table: targetTable,
                postNum: post_num,
                actorId: our_id,
                actorNickname: nickname,
                reactionType: "comment"
            });
        }

        // 본문에 포함된 "@user_id" 멘션 처리 (응답 블로킹 방지를 위해 await 생략)
        extractMentionedIds(subject, our_id).then(async (mentionedIds) => {
            if (mentionedIds.length === 0) return;
            await knex("mention").insert(
                mentionedIds.map(mentioned_id => ({
                    mentioner_id: our_id,
                    mentioned_id,
                    post_type: 2,
                    post_num: comment_num
                }))
            );
            sendMentionNotification({ mentionedIds, actorNickname: nickname });
        }).catch(err => console.error("멘션 처리 실패:", err));
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
        const targetTable = type === 0 ? "talk" : (type === 1 ? "think" : "comment");
        const postColumn = type === 0 ? "talk_num" : (type === 1 ? "think_num" : "comment_num");

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
                "profile.id as writer_profile_id",
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
                "draft",
                knex.raw("(`like` * 2 + quote_num * 3.5 + bookmarks * 2) AS popularity"),
                knex.raw("(SELECT COUNT(*) FROM comment AS r WHERE r.type = 2 AND r.post_num = p.comment_num) AS reply_count"),
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

        // 이 목록은 전부 같은 글(post_num)에 달린 댓글이므로, 원본 글 작성자는 한 번만 조회
        const originalWriterId = await getOriginalPostWriterId(type, post_num);
        for (const comment of comments) {
            comment.is_post_writer = originalWriterId != null && Number(comment.writer_profile_id) === Number(originalWriterId);
            delete comment.writer_profile_id;
        }

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
                "profile.id as writer_profile_id",
                "p.type",
                "p.post_num",
                "subject",
                "like",
                "quote_num AS quotes",
                "bookmarks",
                "draft",
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
                knex.raw("(SELECT COUNT(*) FROM comment AS r WHERE r.type = 2 AND r.post_num = p.comment_num) AS reply_count"),
                ...islikeandbookmark(id, "comment", 2)
            )
            .where("comment_num", comment_id)
            .first();

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "해당 댓글이 존재하지 않습니다."
            });
        }

        const originalWriterId = await getOriginalPostWriterId(comment.type, comment.post_num);
        comment.is_post_writer = originalWriterId != null && Number(comment.writer_profile_id) === Number(originalWriterId);
        delete comment.writer_profile_id;
        delete comment.type;
        delete comment.post_num;

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

router.delete("/:comment_id", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    const comment_data = await knex("comment").select("user_id", "type", "post_num", "draft").where("comment_num", req.params.comment_id).first();
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
        if (comment_data.draft === 0) {
            await knex(TargetTable).where(postColumn, comment_data.post_num).decrement("comment", 1);
        }
        return res.json({ "success": 1 })
    } catch {
        return res.status(500).json({ "success": 0, "msg": "삭제 과정에서 오류가 발생했습니다" });
    }
})

// 내가 작성한 댓글 목록 (차단 유저 게시물 제외)
router.post("/list", async (req, res) => {
    const page = req.body.page || 0;

    let requester_id = null;
    if (req.headers.authorization) {
        requester_id = await define_id(req.headers.authorization, res);
        if (res.headersSent) return;
    }
    if (!requester_id) return res.status(401).json({ msg: "인증이 필요합니다." });

    try {
        const blockedIds = await getBlockedIds(requester_id);

        const comments = await knex("comment as c")
            .leftJoin("profile", "c.user_id", "profile.user_id")
            .where("profile.id", requester_id)
            .modify(function (qb) {
                if (blockedIds.length > 0) {
                    // 원글(talk/think) 작성자가 차단 관계인 댓글 제외
                    // c.type=0 이면 talk, c.type=1 이면 think 테이블에서 writer_id 확인
                    qb.where(function () {
                        // talk에 달린 댓글 중 차단 유저 게시물 제외
                        this.whereNot(function () {
                            this.where("c.type", 0)
                                .whereIn("c.post_num", function () {
                                    this.select("talk_num").from("talk").whereIn("writer_id", blockedIds);
                                });
                        })
                            // think에 달린 댓글 중 차단 유저 게시물 제외
                            .whereNot(function () {
                                this.where("c.type", 1)
                                    .whereIn("c.post_num", function () {
                                        this.select("think_num").from("think").whereIn("writer_id", blockedIds);
                                    });
                            })
                            // 댓글에 달린 댓글 중 차단 유저 댓글 제외
                            .whereNot(function () {
                                this.where("c.type", 2)
                                    .whereIn("c.post_num", function () {
                                        this.select("comment_num").from("comment as parent")
                                            .join("profile as pp", "parent.user_id", "pp.user_id")
                                            .whereIn("pp.id", blockedIds);
                                    });
                            });
                    });
                }
            })
            .select(
                "c.comment_num AS comment_id",
                "c.user_id",
                "profile.id as writer_profile_id",
                "c.subject",
                "c.like",
                "c.quote_num AS quotes",
                "c.bookmarks",
                "c.timestamp",
                "c.type",
                "c.post_num",
                "c.photo",
                "c.photo_1",
                "c.photo_2",
                "c.photo_3",
                "c.photo_4",
                "c.photo_5",
                "c.vote",
                "c.reported",
                "profile.nickname",
                "profile.image as profile_image",
                knex.raw("(SELECT COUNT(*) FROM comment AS r WHERE r.type = 2 AND r.post_num = c.comment_num) AS reply_count"),
                ...islikeandbookmark(requester_id, "comment", 2)
            )
            .orderBy("c.timestamp", "desc")
            .limit(10)
            .offset(page * 10);

        // 본인이 작성한 댓글들이라 글마다 원본 글이 다를 수 있어, 각 댓글마다 원본 작성자를 조회
        await Promise.all(comments.map(async (comment) => {
            const originalWriterId = await getOriginalPostWriterId(comment.type, comment.post_num);
            comment.is_post_writer = originalWriterId != null && Number(comment.writer_profile_id) === Number(originalWriterId);
            delete comment.writer_profile_id;
        }));

        res.json(comments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: "서버 오류가 발생했습니다." });
    }
});

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
