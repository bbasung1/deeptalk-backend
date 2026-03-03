const express = require("express");
const router = express.Router();
const axios = require("axios");
const define_id = require("../general.js").define_id;
const handleBlockAction = require("../general.js").handleBlockAction;

const knex = require("../knex.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
const TYPE_MUTE = require("../general.js").TYPE_MUTE;

// mute 등록
router.post("/", (req, res) => handleBlockAction(req, res, "mute"));

// mute 해제
router.delete("/", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const { target_id } = req.body;
    if (!target_id) {
        return res.status(400).json({ success: false, message: "target_id가 필요합니다." });
    }

    try {
        const deleted = await knex("block_list")
            .where({
                user_id: ourid,
                blocked_user_id: target_id,
                type: TYPE_MUTE
            })
            .del();

        if (deleted === 0) {
            return res.status(404).json({ success: false, message: "mute 기록이 없습니다." });
        }

        return res.json({ success: true, message: "mute 해제 완료" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류" });
    }
});

router.post("/list", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) {
        return res.status(400).json({ success: 0, msg: "id 인식 실패" });
    }
    const content = await knex("block_list").select("block_list.blocked_user_id","profile.nickname","profile.user_id","profile.image").leftJoin("profile", "block_list.blocked_user_id", "profile.id").where({ "block_list.user_id": ourid, "block_list.type": TYPE_MUTE });
    console.log(content);
    return res.json(content)
});

module.exports = router;