const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, user_id_to_id } = require('./general.js');
const admin = require("firebase-admin");

router.use(express.json());

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    });
}

async function sendPostNotification(writer_id, nickname, mode) {
    try {
        // follow와 fcm_token을 JOIN하여 팔로워들의 FCM 토큰 조회
        const followerTokens = await knex("follow")
            .join("fcm_token", "follow.user_id", "=", "fcm_token.our_id")
            .where("follow.friend_id", writer_id)
            .select("fcm_token.fcm_token", "fcm_token.type");

        if (followerTokens.length === 0) return;

        // 모든 토큰 객체 추출 (토큰과 타입 정보 포함)
        const tokens = followerTokens.map(record => record.fcm_token);

        const postType = mode === "Jam-Talk" ? "자유" : "진대";

        const message = {
            notification: {
                title: `${nickname}님이 새 ${postType}글을 작성했습니다.`,
                body: "지금 확인해보세요!",
            },
            tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`FCM 알림 발송 완료 - 성공: ${response.successCount}, 실패: ${response.failureCount}`);
        console.log("FCM 응답:", response);
    } catch (err) {
        console.error("FCM 알림 발송 실패:", err);
    }
}

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

router.get("/test", async (req, res) => {
    await sendPostNotification(1, "테스트", "Jam-Talk");
    res.json({ success: 1, message: "테스트 알림 발송 완료" });
})

module.exports = router;
module.exports.sendPostNotification = sendPostNotification;
