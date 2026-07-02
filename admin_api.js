// 어드민 리뉴얼(React 프론트엔드) 전용 JSON API.
// admin.js(레거시 쿠키 기반 HTML 화면)와 달리 Authorization: Bearer <JWT> 헤더로 인증한다.
// 다른 origin(별도 저장소의 React 앱)에서 호출하므로 CORS를 이 라우터에만 국한해서 연다 — 앱 전체에는 열지 않음.
const express = require("express");
const router = express.Router();
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const knex = require("./knex.js");
const bcrypt = require("bcrypt");
const {
    requireAdminApi,
    issueAdminSession,
    revokeAdminToken,
    getTokenFromAuthHeader,
} = require("./utils/adminAuth.js");
const { logAdminAction } = require("./utils/auditLog.js");
const { isValidActionType, applyReportAction } = require("./utils/reportActions.js");

// 개발 중에는 Vite 기본 포트, 배포 시에는 .env의 ADMIN_WEB_ORIGIN으로 교체.
const ADMIN_WEB_ORIGIN = process.env.ADMIN_WEB_ORIGIN || "http://localhost:5173";

// 로그인 브루트포스 방어. admin.js의 로그인 라우트와 동일한 정책(IP당 15분 10회) — 별도 엔드포인트라
// 카운터는 따로 관리되지만, 어느 한쪽만 뚫는 것도 똑같이 막혀야 하므로 정책 자체는 통일해둔다.
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: 0, msg: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요." },
});

router.use(cors({ origin: ADMIN_WEB_ORIGIN }));
router.use(express.json());

router.post("/login", loginRateLimiter, async (req, res) => {
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

// 신고 처리 액션 실행(RPT-006). React 프론트엔드용 — admin.js의 /admin/setblock/status(레거시 HTML 폼)와
// 동일한 utils/reportActions.js를 공유한다. body: { action_type, memo, resolution_type, duration_hours }
// - resolution_type: action_type이 "dismissed"일 때만 의미 있음(dismissed/duplicate/insufficient_evidence 드롭다운 값)
// - duration_hours: action_type이 "write_restricted"/"account_suspended"일 때 제재 기간(시간 단위, 프리셋 3/7/30일도
//   호출부에서 시간으로 환산해서 보낸다). 없으면 기간 없이 상태만 바뀜.
router.post(
    "/reports/:report_id/actions",
    requireAdminApi(async (req, res) => {
        const report_id = parseInt(req.params.report_id, 10);
        const { action_type, memo, resolution_type, duration_hours } = req.body;
        if (isNaN(report_id) || !isValidActionType(action_type)) {
            return res.status(400).json({ success: 0, msg: "잘못된 요청입니다." });
        }
        try {
            const result = await applyReportAction(knex, {
                report_id,
                action_type,
                memo,
                resolutionTypeOverride: resolution_type,
                durationHours: duration_hours,
                adminId: req.admin.id,
            });
            await logAdminAction({
                adminId: req.admin.id,
                action: "report_status_change",
                target_type: "report",
                target_id: report_id,
                detail: `action_type=${action_type}, status=${result.status}, resolution_type=${result.resolution_type ?? "null"}`,
            });
            return res.json({ success: 1, status: result.status, resolution_type: result.resolution_type });
        } catch (err) {
            if (err.message === "REPORT_NOT_FOUND") {
                return res.status(404).json({ success: 0, msg: "존재하지 않는 신고입니다." });
            }
            console.error("Error in report action API:", err);
            return res.status(500).json({ success: 0, msg: "서버 오류가 발생했습니다." });
        }
    })
);

module.exports = router;
