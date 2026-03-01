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
    // const ourid = await user_id_to_id(req.params.user_id);
    // if (ourid == undefined) {
    //     return res.status(404).json({ msg: "존재하지 않는 유저입니다" });
    // }
    // const list = await knex("follow").leftJoin("profile", "follow.user_id", "profile.id").where("follow.friend_id", ourid).select("profile.nickname", "profile.user_id", "profile.image");
    // for (i of list) {
    //     const target_id = user_id_to_id(i.user_id);
    //     const is_follow = await knex("follow").select("*").where({ "friend_id": ourid, "user_id": target_id }).first();
    //     i.is_follow = 0
    //     if (is_follow != undefined) {
    //         i.is_follow = 1
    //     }
    // }
    // res.json(list);
    try {
        const ourid = await user_id_to_id(req.params.user_id);

        if (!ourid) {
            return res.status(404).json({ msg: "존재하지 않는 유저입니다" });
        }

        // 단 한 번의 쿼리로 프로필 정보와 맞팔로우 상태를 가져옵니다.
        const list = await knex("follow")
            .leftJoin("profile", "follow.user_id", "profile.id")
            .where("follow.friend_id", ourid)
            .select(
                "profile.nickname",
                "profile.user_id",
                "profile.image",
                // 서브쿼리: 현재 유저(ourid)가 이 팔로워(follow.user_id)를 팔로우하고 있는지 확인
                knex.raw(
                    "EXISTS(SELECT 1 FROM follow AS f2 WHERE f2.user_id = ? AND f2.friend_id = follow.user_id) AS is_follow",
                    [ourid]
                )
            );

        // SQLite나 MySQL에 따라 exists 결과가 0/1 또는 boolean일 수 있으므로 포맷팅
        const result = list.map(item => ({
            ...item,
            is_follow: item.is_follow ? 1 : 0
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: "서버 에러가 발생했습니다" });
    }
})

router.get("/like/:type/:post_id", async (req, res) => {
    const type = req.params.type == "free" ? 0 : 1;
    const list = await knex("post_like").leftJoin("profile", "post_like.user_id", "profile.id").where({ "post_like.type": type, "post_like.post_id": req.params.post_id }).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);

});

module.exports = router;