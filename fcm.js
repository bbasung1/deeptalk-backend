const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, user_id_to_id } = require('./general.js');

router.use(express.json());

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.post("/token", async (req, res) => {
    const our_id = await define_id(req.headers.authorization, res);
    if (!our_id) {
        return res.status(404).json({ success: 0, message: "authorization이 유효하지 않습니다." });
    }
    try {
        const { type, token } = req.body;
        if (type != "android" && type != "ios") {
            return res.status(400).json({ success: 0, message: "type값이 올바르지 않습니다" });
        }
        await knex("fcm_token").insert({ our_id, type, fcm_token: token }).onConflict(["type", "fcm_token"]).merge({ our_id });
        return res.status(201).json({ success: 1, message: "성공적으로 등록되었습니다." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: 0, message: "서버 내부 오류가 발생했습니다." });
    }
})

module.exports = router;