const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { user_id_to_id } = require("./general.js");
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

router.get("/follow/:user_id", async (req, res) => {
    const ourid = await user_id_to_id(req.params.user_id)
    if (ourid == undefined) {
        return res.status(404).json({ msg: "존재하지 않는 유저입니다" });
    }
    const list = await knex("follow").leftJoin("profile", "follow.friend_id", "profile.id").where("follow.user_id", ourid).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);
})

router.get("/follower/:user_id", async (req, res) => {
    const ourid = await user_id_to_id(req.params.user_id);
    if (ourid == undefined) {
        return res.status(404).json({ msg: "존재하지 않는 유저입니다" });
    }
    const list = await knex("follow").leftJoin("profile", "follow.user_id", "profile.id").where("follow.friend_id", req.params.id).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);
})

router.get("/like/:type/:post_id", async (req, res) => {
    const type = req.params.type == "free" ? 0 : 1;
    const list = await knex("post_like").leftJoin("profile", "post_like.user_id", "profile.id").where({ "post_like.type": type, "post_like.post_id": req.params.post_id }).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);

});

module.exports = router;