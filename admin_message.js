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

// 내가 받은 어드민 메시지 조회 (인증 필요, 나에게 온 것만 조회 가능).
// admin_messages(발송 내용)와 admin_message_reads(내 읽음 기록)를 분리해서 저장하므로
// LEFT JOIN으로 합쳐서 is_read/read_at을 계산함 (읽지 않았으면 admin_message_reads에 행이 없음).
// "나에게 온 메시지" = 전체 공지(target_type=all) 또는 나를 지정한 개별 메시지(target_user_id=내 id).
router.get("/", async (req, res) => {
    const my_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!my_id) {
        return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const page = Math.max(parseInt(req.query.page) || 0, 0);

    try {
        const messages = await knex("admin_messages as m")
            .leftJoin("admin_message_reads as r", function () {
                this.on("r.message_id", "=", "m.id").andOn("r.user_id", "=", knex.raw("?", [my_id]));
            })
            .where(function () {
                this.where("m.target_type", "all").orWhere({ "m.target_type": "individual", "m.target_user_id": my_id });
            })
            .select(
                "m.id",
                "m.title",
                "m.content as body",
                "m.sent_at as created_at",
                knex.raw("(r.id IS NOT NULL) AS is_read"),
                "r.read_at"
            )
            .orderBy("m.sent_at", "desc")
            .limit(20)
            .offset(page * 20);

        return res.json({ success: true, messages });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 어드민 메시지 읽음 처리 (나에게 온 메시지만 처리 가능).
// admin_message_reads에는 (user_id, message_id) UNIQUE가 걸려 있어서, 이미 읽은 메시지를
// 다시 읽음 처리해도 두 번째부터는 INSERT IGNORE로 조용히 무시됨 (read_at은 최초 시각 유지, 멱등).
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
        // 이 메시지가 실제로 나에게 온 메시지인지 확인 (다른 사람 대상 메시지를 추측해
        // 읽음 처리하지 못하도록 동일한 404로 응답).
        const message = await knex("admin_messages")
            .where("id", message_id)
            .where(function () {
                this.where("target_type", "all").orWhere({ target_type: "individual", target_user_id: my_id });
            })
            .first();

        if (!message) {
            return res.status(404).json({ success: false, message: "메시지를 찾을 수 없습니다." });
        }

        await knex("admin_message_reads")
            .insert({ user_id: my_id, message_id: message_id })
            .onConflict(["user_id", "message_id"])
            .ignore();

        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;
