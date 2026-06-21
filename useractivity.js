const express = require("express");
const router = express.Router();
const knex = require("./knex.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
const { user_id_to_id, islikeandbookmark, iscommentandquote, define_id, getBlockedIds } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.post("/", async (req, res) => {
    const page = req.body.page || 0;

    const requester_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!requester_id) return res.status(401).json({ msg: "인증이 필요합니다." });

    const user_id = req.body.user_id;
    const target_id = await user_id_to_id(user_id);
    if (!target_id) return res.status(404).json({ msg: "존재하지 않는 유저입니다." });

    const blockedIds = await getBlockedIds(requester_id);

    try {
        if (req.body.type == "talk") {
            const talk = await knex('talk')
                .where('writer_id', target_id)
                .whereNotIn('writer_id', blockedIds)
                .leftJoin("profile", "talk.writer_id", "profile.id")
                .select('talk.*', ...islikeandbookmark(requester_id, "talk", 0), ...iscommentandquote(requester_id, "talk", 0, "is_comment", "talk"), "profile.nickname", "profile.image as profile_image")
                .limit(10).offset(page * 10);
            return res.json(await buildPostResponse(talk, requester_id));
        }
        if (req.body.type == "think") {
            const think = await knex('think')
                .where('writer_id', target_id)
                .whereNotIn('writer_id', blockedIds)
                .leftJoin("profile", "think.writer_id", "profile.id")
                .select('think.*', ...islikeandbookmark(requester_id, "think", 1), ...iscommentandquote(requester_id, "think", 1, "is_comment", "think"), "profile.nickname", "profile.image as profile_image")
                .limit(10).offset(page * 10);
            return res.json(await buildPostResponse(think, requester_id));
        }
        if (req.body.type == "comment") {
            const comments = await knex('comment')
                .where('comment.user_id', user_id)
                .leftJoin("profile", "comment.user_id", "profile.user_id")
                .whereNotIn('profile.id', blockedIds)
                .select("comment.*", ...islikeandbookmark(requester_id, "comment", 2), ...iscommentandquote(requester_id, "comment", 2, "is_reply", "comment"), "profile.nickname", "profile.image as profile_image")
                .limit(10).offset(page * 10);
            const serializedComments = comments.map(c => ({
                ...c,
                is_like: Boolean(c.is_like),
                is_bookmark: Boolean(c.is_bookmark),
                is_reply: Boolean(c.is_reply),
                is_quote: Boolean(c.is_quote),
            }));
            return res.json(serializedComments);
        }
        return res.status(400).json({ msg: "type은 talk, think, comment 중 하나여야 합니다." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "서버 오류가 발생했습니다." });
    }
})

// 내가 작성한 인용 목록 (talk + think, 차단 유저 게시물 제외)
router.post("/quote_list", async (req, res) => {
    const page = req.body.page || 0;

    let requester_id = null;
    if (req.headers.authorization) {
        requester_id = await define_id(req.headers.authorization, res);
        if (res.headersSent) return;
    }
    if (!requester_id) return res.status(401).json({ msg: "인증이 필요합니다." });

    try {
    const blockedIds = await getBlockedIds(requester_id);

    // 인용된 원본 게시물 작성자가 차단 관계인 경우 제외
    const quoteBlockFilter = function () {
        if (blockedIds.length === 0) return;
        this.whereNot(function () {
            // 원본이 talk인 경우
            this.where("p.quote_type", 0)
                .whereIn("p.quote", function () {
                    this.select("talk_num").from("talk").whereIn("writer_id", blockedIds);
                });
        })
        .whereNot(function () {
            // 원본이 think인 경우
            this.where("p.quote_type", 1)
                .whereIn("p.quote", function () {
                    this.select("think_num").from("think").whereIn("writer_id", blockedIds);
                });
        })
        .whereNot(function () {
            // 원본이 comment인 경우
            this.where("p.quote_type", 2)
                .whereIn("p.quote", function () {
                    this.select("comment_num").from("comment as orig")
                        .join("profile as pp", "orig.user_id", "pp.user_id")
                        .whereIn("pp.id", blockedIds);
                });
        });
    };

    const [talks, thinks] = await Promise.all([
        knex("talk as p")
            .leftJoin("profile", "p.writer_id", "profile.id")
            .where("p.writer_id", requester_id)
            .whereNotNull("p.quote")
            .modify(quoteBlockFilter)
            .select(
                "p.talk_num", "p.writer_id", "p.user_id", "p.header", "p.subject",
                "p.like", "p.comment", "p.views", "p.mylist", "p.quote_num",
                "p.quote", "p.quote_type", "p.photo", "p.photo_1", "p.photo_2",
                "p.photo_3", "p.photo_4", "p.photo_5", "p.vote", "p.draft",
                "p.notify_mute", "p.timestamp",
                "profile.nickname", "profile.image as profile_image",
                ...islikeandbookmark(requester_id, "talk", 0),
                ...iscommentandquote(requester_id, "talk", 0, "is_comment", "p")
            ),
        knex("think as p")
            .leftJoin("profile", "p.writer_id", "profile.id")
            .where("p.writer_id", requester_id)
            .whereNotNull("p.quote")
            .modify(quoteBlockFilter)
            .select(
                "p.think_num", "p.writer_id", "p.user_id", "p.header", "p.subject",
                "p.like", "p.comment", "p.views", "p.mylist", "p.quote_num",
                "p.quote", "p.quote_type", "p.photo", "p.photo_1", "p.photo_2",
                "p.photo_3", "p.photo_4", "p.photo_5", "p.vote", "p.draft",
                "p.notify_mute", "p.timestamp",
                "profile.nickname", "profile.image as profile_image",
                ...islikeandbookmark(requester_id, "think", 1),
                ...iscommentandquote(requester_id, "think", 1, "is_comment", "p")
            ),
    ]);

    const merged = [...talks, ...thinks]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(page * 10, (page + 1) * 10);

    const posts = await buildPostResponse(merged, requester_id);
    res.json(posts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;