const express = require("express");
const router = express.Router();
const knex = require("./knex.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
const { user_id_to_id, islikeandbookmark, define_id, getBlockedIds } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.post("/", async (req, res) => {
    let user_id = req.body.user_id;
    const page = req.body.page || 0;
    let id = await user_id_to_id(user_id);
    if (req.body.type == "talk") {
        const talk = await knex('talk')
            .where('writer_id', id)
            .leftJoin("profile", "talk.writer_id", "profile.id")
            .select('talk.*', ...islikeandbookmark(id, "talk", 0), "profile.nickname", "profile.image as profile_image").limit(10)
            .offset(page * 10);
        return res.json(await buildPostResponse(talk, id));
    }
    if (req.body.type == "think") {
        const think = await knex('think')
            .where('writer_id', id)
            .leftJoin("profile", "think.writer_id", "profile.id")
            .select('think.*', ...islikeandbookmark(id, "think", 1), "profile.nickname", "profile.image as profile_image").limit(10)
            .offset(page * 10);
        return res.json(await buildPostResponse(think, id));
    }
    if (req.body.type == "comment") {
        const user = await knex('comment')
            .where('comment.user_id', user_id)
            .leftJoin("profile", "comment.user_id", "profile.user_id")
            .select("comment.*", ...islikeandbookmark(id, "comment", 2), "profile.nickname", "profile.image as profile_image").limit(10)
            .offset(page * 10);
        res.json(user);
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

    const blockedIds = await getBlockedIds(requester_id);

    const blockFilter = function () {
        if (blockedIds.length > 0) {
            this.whereNotIn("writer_id", blockedIds);
        }
    };

    const [talks, thinks] = await Promise.all([
        knex("talk as p")
            .leftJoin("profile", "p.writer_id", "profile.id")
            .where("p.writer_id", requester_id)
            .whereNotNull("p.quote")
            .modify(blockFilter)
            .select(
                "p.talk_num", "p.writer_id", "p.user_id", "p.header", "p.subject",
                "p.like", "p.comment", "p.views", "p.mylist", "p.quote_num",
                "p.quote", "p.quote_type", "p.photo", "p.photo_1", "p.photo_2",
                "p.photo_3", "p.photo_4", "p.photo_5", "p.vote", "p.draft",
                "p.notify_mute", "p.timestamp",
                "profile.nickname", "profile.image as profile_image",
                ...islikeandbookmark(requester_id, "talk", 0)
            ),
        knex("think as p")
            .leftJoin("profile", "p.writer_id", "profile.id")
            .where("p.writer_id", requester_id)
            .whereNotNull("p.quote")
            .modify(blockFilter)
            .select(
                "p.think_num", "p.writer_id", "p.user_id", "p.header", "p.subject",
                "p.like", "p.comment", "p.views", "p.mylist", "p.quote_num",
                "p.quote", "p.quote_type", "p.photo", "p.photo_1", "p.photo_2",
                "p.photo_3", "p.photo_4", "p.photo_5", "p.vote", "p.draft",
                "p.notify_mute", "p.timestamp",
                "profile.nickname", "profile.image as profile_image",
                ...islikeandbookmark(requester_id, "think", 1)
            ),
    ]);

    const merged = [...talks, ...thinks]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(page * 10, (page + 1) * 10);

    const posts = await buildPostResponse(merged, requester_id);
    res.json(posts);
});

module.exports = router;