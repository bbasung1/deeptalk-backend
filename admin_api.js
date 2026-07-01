// 어드민 리뉴얼(React 프론트엔드) 전용 JSON API.
// admin.js(레거시 쿠키 기반 HTML 화면)와 달리 Authorization: Bearer <JWT> 헤더로 인증한다.
// 다른 origin(별도 저장소의 React 앱)에서 호출하므로 CORS를 이 라우터에만 국한해서 연다 — 앱 전체에는 열지 않음.
const express = require("express");
const router = express.Router();
const cors = require("cors");
const knex = require("./knex.js");
const bcrypt = require("bcrypt");
const {
    requireAdminApi,
    issueAdminSession,
    revokeAdminToken,
    getTokenFromAuthHeader,
} = require("./utils/adminAuth.js");

// 개발 중에는 Vite 기본 포트, 배포 시에는 .env의 ADMIN_WEB_ORIGIN으로 교체.
const ADMIN_WEB_ORIGIN = process.env.ADMIN_WEB_ORIGIN || "http://localhost:5173";

router.use(cors({ origin: ADMIN_WEB_ORIGIN }));
router.use(express.json());

router.post("/login", async (req, res) => {
    try {
        const email = (req.body.email || "").trim();
        const password = req.body.password || "";
        if (!email || !password) {
            return res.status(400).json({ success: 0, msg: "이메일/비밀번호를 입력해주세요." });
        }

        const admin = await knex("admins").where({ email, is_active: 1 }).first();
        if (!admin || !admin.password_hash) {
            return res.status(401).json({ success: 0, msg: "이메일 또는 비밀번호가 올바르지 않습니다." });
        }

        const ok = await bcrypt.compare(password, admin.password_hash);
        if (!ok) {
            return res.status(401).json({ success: 0, msg: "이메일 또는 비밀번호가 올바르지 않습니다." });
        }

        const token = await issueAdminSession(admin);
        return res.json({
            success: 1,
            token,
            admin: { id: admin.id, email: admin.email, name: admin.name },
        });
    } catch (err) {
        console.error("Error in admin_api login:", err);
        return res.status(500).json({ success: 0, msg: "서버 오류가 발생했습니다." });
    }
});

router.post(
    "/logout",
    requireAdminApi(async (req, res) => {
        await revokeAdminToken(getTokenFromAuthHeader(req));
        res.json({ success: 1 });
    })
);

router.get(
    "/me",
    requireAdminApi(async (req, res) => {
        res.json({ success: 1, admin: req.admin });
    })
);

module.exports = router;
