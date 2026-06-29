const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, normalizeDeviceType } = require("./general.js");
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

// 프론트가 세션을 명시적으로 시작/종료시켜야 노션 스펙의 "진짜 세션"(체류시간 포함)을
// 기록할 수 있음. login_log 기반 admin 페이지(30분 휴리스틱)와는 별개의 데이터 소스.
// 분석용 데이터일 뿐이라 실패해도 앱 사용 자체를 막으면 안 되므로 최소한으로 작성함.
router.post("/", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!id) return res.status(401).json({ success: 0, message: "인증이 필요합니다." });

    try {
        const [sessionId] = await knex("sessions").insert({
            user_id: id,
            device_type: normalizeDeviceType(req.body.device_type),
        });
        return res.status(201).json({ success: 1, session_id: sessionId });
    } catch (err) {
        console.error("sessions insert failed:", err);
        return res.status(500).json({ success: 0, message: "서버 내부 오류가 발생했습니다." });
    }
});

// 세션 종료. 본인 소유의, 아직 끝나지 않은 세션만 종료할 수 있도록 user_id로 소유권을
// 확인하고 ended_at IS NULL인 행만 대상으로 해서 같은 세션을 두 번 종료해도(이미 종료된
// 세션을 다시 보내도) 덮어쓰지 않고 그냥 0행 update로 끝나게 함 (멱등성).
router.patch("/:id/end", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!id) return res.status(401).json({ success: 0, message: "인증이 필요합니다." });

    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ success: 0, message: "유효하지 않은 session id 입니다." });
    }

    try {
        const session = await knex("sessions")
            .where({ id: sessionId, user_id: id })
            .first();

        if (!session) {
            return res.status(404).json({ success: 0, message: "세션을 찾을 수 없습니다." });
        }

        if (session.ended_at != null) {
            // 이미 종료된 세션 — 중복 호출로 보고 현재 상태를 그대로 반환 (idempotent)
            return res.json({ success: 1, message: "이미 종료된 세션입니다.", duration_seconds: session.duration_seconds });
        }

        const updated = await knex("sessions")
            .where({ id: sessionId, user_id: id })
            .whereNull("ended_at")
            .update({
                ended_at: knex.fn.now(),
                duration_seconds: knex.raw("TIMESTAMPDIFF(SECOND, started_at, NOW())"),
            });

        if (updated === 0) {
            // 동시 요청 등으로 그 사이 다른 요청이 먼저 종료시킨 경우
            return res.json({ success: 1, message: "이미 종료된 세션입니다." });
        }

        const [final] = await knex("sessions").select("duration_seconds").where("id", sessionId);
        return res.json({ success: 1, message: "세션이 종료되었습니다.", duration_seconds: final ? final.duration_seconds : null });
    } catch (err) {
        console.error("sessions end failed:", err);
        return res.status(500).json({ success: 0, message: "서버 내부 오류가 발생했습니다." });
    }
});

module.exports = router;
