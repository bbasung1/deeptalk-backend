const express = require("express");
const router = express.Router();
const axios = require("axios");
const define_id = require("../general.js").define_id;
const handleBlockAction = require("../general.js").handleBlockAction;
const typeMap = require("../general.js").typeMap;
const TYPE_BLOCK = require("../general.js").TYPE_BLOCK;

const knex = require("../knex.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// block 등록
router.post("/", (req, res) => handleBlockAction(req, res, "block"));

// block 해제
router.delete("/", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const { target_id } = req.body;
    if (!target_id) {
        return res.status(400).json({ success: false, message: "target_id가 필요합니다." });
    }

    try {
        await knex.transaction(async (trx) => {
            // 1. block_list 삭제
            const deleted = await trx("block_list")
                .where({
                    user_id: ourid,
                    blocked_user_id: target_id,
                    type: TYPE_BLOCK
                })
                .del();

            if (deleted === 0) {
                return res.status(404).json({ success: false, message: "차단 기록이 없습니다." });
            }

            // 2. follow_backup 확인
            const backup = await trx("follow_backup")
                .where({ user_id1: ourid, user_id2: target_id })
                .first();

            if (backup) {
                // relation 에 맞게 복구
                if (backup.relation === 0 || backup.relation === 2) {
                    await trx("follow").insert({ user_id: ourid, friend_id: target_id });
                }
                if (backup.relation === 1 || backup.relation === 2) {
                    await trx("follow").insert({ user_id: target_id, friend_id: ourid });
                }

                // backup 삭제
                await trx("follow_backup")
                    .where({ user_id1: ourid, user_id2: target_id })
                    .del();
            }
        });

        return res.json({ success: true, message: "block 해제 및 follow 복원 완료" });
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
    console.log(ourid);
    console.log("Type:" + TYPE_BLOCK);
    const content = await knex("block_list").select("blocked_user_id").where({ user_id: ourid, type: TYPE_BLOCK });
    console.log(content);
    return res.json(content)
});

module.exports = router;