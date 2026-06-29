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

// 프론트엔드가 앱이 포그라운드로 올라올 때마다(콜드 스타트 포함) 호출.
// login_log와 달리 토큰 갱신 없이 다시 열린 경우까지 잡아내기 위한 별도 이벤트.
// 분석용 데이터일 뿐이라 실패해도 앱 사용 자체를 막으면 안 되므로, 이 라우트는
// 단순 insert 외 다른 부수효과가 없게 최소한으로 작성함.
router.post("/", async (req, res) => {
    const id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!id) return res.status(401).json({ success: 0, message: "인증이 필요합니다." });

    try {
        await knex("app_launch_event").insert({ user_id: id });
        return res.status(201).json({ success: 1, message: "기록되었습니다." });
    } catch (err) {
        console.error("app_launch_event insert failed:", err);
        return res.status(500).json({ success: 0, message: "서버 내부 오류가 발생했습니다." });
    }
});

module.exports = router;
