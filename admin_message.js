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

// 내가 받은 어드민 메시지 조회 (인증 필요, 본인 것만 조회 가능)
router.get("/", async (req, res) => {
    const my_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!my_id) {
        return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const page = Math.max(parseInt(req.query.page) || 0, 0);

    try {
        const messages = await knex("admin_message")
            .where("user_id", my_id)
            .select("id", "title", "body", "created_at", "is_read", "read_at")
            .orderBy("created_at", "desc")
            .limit(20)
            .offset(page * 20);

        return res.json({ success: true, messages });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 어드민 메시지 읽음 처리 (본인 소유의 메시지만 처리 가능, read_at은 최초 1회만 기록)
router.patch("/:message_id/read", async (req, res) => {
    const my_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!my_id) {
        return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const message_id = parseInt(req.params.message_id);
    if (isNaN(message_id)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 message_id입니다." });
    }

    try {
        // 존재 여부와 소유권을 함께 확인 (다른 사람의 메시지를 추측해 변경하지 못하도록 동일한 404로 응답)
        // is_read=0인 행만 갱신해서 read_at이 이후 호출로 덮어씌워지지 않게 함.
        const updated = await knex("admin_message")
            .where({ id: message_id, user_id: my_id, is_read: 0 })
            .update({ is_read: 1, read_at: knex.fn.now() });

        if (updated === 0) {
            const exists = await knex("admin_message")
                .where({ id: message_id, user_id: my_id })
                .first();
            if (!exists) {
                return res.status(404).json({ success: false, message: "메시지를 찾을 수 없습니다." });
            }
            // 이미 읽음 처리된 경우도 성공으로 응답 (멱등)
            return res.json({ success: true });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;
