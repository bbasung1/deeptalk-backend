const express = require("express");
const router = express.Router();
const axios = require("axios");
const define_id = require("../general.js").define_id;

const knex = require("../knex.js");
router.use(express.json());

router.put("/", async (req, res) => {
    ourid = await define_id(req.headers.authorization, res);
    const msg = req.body.msg;
    try {
        await knex("profile").update({ "status_message": msg }).where("id", ourid);
        return res.json({ success: 1 });
    } catch (err) {
        console.log(err)
        return res.status(500).json({ success: 0, msg: "서버 오류가 발생했습니다" })
    }
});

module.exports = router;