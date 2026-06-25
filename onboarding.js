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

const ONBOARDING_EVENT_TYPES = new Set(["start", "step", "complete", "drop"]);

// 프론트엔드가 스토리 온보딩 진행 상황(시작/단계 도달/완료/이탈)을 보낼 때마다 호출.
// step/drop은 어떤 단계에서 일어났는지 알아야 하므로 step 번호가 필수.
router.post("/", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!id) return res.status(401).json({ success: 0, message: "인증이 필요합니다." });

    const { event_type, step } = req.body;

    if (!ONBOARDING_EVENT_TYPES.has(event_type)) {
        return res.status(400).json({ success: 0, message: "event_type 값이 올바르지 않습니다. (start | step | complete | drop)" });
    }

    let stepValue = null;
    if (event_type === "step" || event_type === "drop") {
        const parsedStep = Number(step);
        if (!Number.isInteger(parsedStep) || parsedStep < 1) {
            return res.status(400).json({ success: 0, message: "step은 1 이상의 정수여야 합니다." });
        }
        stepValue = parsedStep;
    }

    try {
        await knex("story_onboarding_event").insert({
            user_id: id,
            event_type,
            step: stepValue,
        });
        return res.status(201).json({ success: 1, message: "기록되었습니다." });
    } catch (err) {
        console.error("story_onboarding_event insert failed:", err);
        return res.status(500).json({ success: 0, message: "서버 내부 오류가 발생했습니다." });
    }
});

module.exports = router;
