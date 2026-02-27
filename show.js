const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id } = require("./general.js");
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

router.get("/follow/:id", async (req, res) => {
    const list = await knex("follow").leftJoin("profile", "follow.friend_id", "profile.id").where("follow.user_id", req.params.id).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);
})

router.get("/follower/:id", async (req, res) => {
    const list = await knex("follow").leftJoin("profile", "follow.user_id", "profile.id").where("follow.friend_id", req.params.id).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);
})

module.exports = router;