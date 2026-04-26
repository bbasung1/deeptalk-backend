const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, islikeandbookmark } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

// GET /quote/list/:type/:post_id
// :type  - 인용된 게시물의 타입: 0=talk, 1=think, 2=comment
// :post_id - 인용된 게시물의 번호 (talk_num / think_num / comment_num)
// query  - page (기본 0, 페이지당 10건)
router.get("/list/:type/:post_id", async (req, res) => {
    const quoteType = parseInt(req.params.type, 10);
    if (![0, 1, 2].includes(quoteType)) {
        return res.status(400).json({ msg: "type은 0(talk), 1(think), 2(comment) 중 하나여야 합니다." });
    }

    const postId = req.params.post_id;
    const page = parseInt(req.query.page, 10) || 0;

    let userId = null;
    if (req.headers.authorization) {
        userId = await define_id(req.headers.authorization, res);
        if (res.headersSent) return;
    }

    try {
        const blockSubquery = function () {
            this.select("blocked_user_id").from("block_list").where("user_id", userId);
        };

        const [talks, thinks, comments] = await Promise.all([
            knex("talk as p")
                .leftJoin("profile", "p.writer_id", "profile.id")
                .where({ "p.quote_type": quoteType, "p.quote": postId })
                .modify(q => {
                    if (userId) q.whereNotIn("p.writer_id", blockSubquery);
                })
                .select(
                    "p.*",
                    "profile.nickname",
                    "profile.image as profile_image",
                    ...islikeandbookmark(userId, "talk", 0)
                )
                .orderBy("p.talk_num", "desc")
                .limit(10)
                .offset(page * 10),

            knex("think as p")
                .leftJoin("profile", "p.writer_id", "profile.id")
                .where({ "p.quote_type": quoteType, "p.quote": postId })
                .modify(q => {
                    if (userId) q.whereNotIn("p.writer_id", blockSubquery);
                })
                .select(
                    "p.*",
                    "profile.nickname",
                    "profile.image as profile_image",
                    ...islikeandbookmark(userId, "think", 1)
                )
                .orderBy("p.think_num", "desc")
                .limit(10)
                .offset(page * 10),

            knex("comment as p")
                .leftJoin("profile", "p.user_id", "profile.user_id")
                .where({ "p.quote_type": quoteType, "p.quote": postId })
                .modify(q => {
                    if (userId) q.whereNotIn("p.user_id", blockSubquery);
                })
                .select(
                    "p.*",
                    "profile.nickname",
                    "profile.image as profile_image",
                    ...islikeandbookmark(userId, "comment", 2)
                )
                .orderBy("p.comment_num", "desc")
                .limit(10)
                .offset(page * 10),
        ]);

        const posts = await buildPostResponse([...talks, ...thinks], userId);
        return res.json({ posts, comments });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;
