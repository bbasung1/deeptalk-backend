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
const {
    isValidActionType,
    applyReportAction,
    classifyReportTab,
    getReportTypeFilterForTab,
} = require("./utils/reportActions.js");

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

// 신고 목록 조회(PHN-001~004). tab으로 필터, 긴급 플래그 우선 + 접수시각 오름차순 정렬(PHN-002).
// query: tab(all/report/appeal/feedback/error/other/history, 기본 all), page(기본 1), limit(기본 30, 최대 100)
// "history"(처리 이력) 탭은 report_type이 아니라 status 기준 — resolved/appeal_resolved인 건 전체.
// 라우트 등록 순서 주의: /reports/counts, /reports/:report_id보다 먼저 정의해야 하는 리스트 라우트라
// 경로 충돌은 없지만(둘 다 /reports 바로 아래), /reports/counts는 /reports/:report_id보다 먼저 등록해야
// Express가 "counts"를 report_id로 착각해서 매칭하지 않는다 — 아래 counts 라우트 위치 참고.
router.get(
    "/reports",
    requireAdminApi(async (req, res) => {
        const { tab = "all" } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
        const offset = (page - 1) * limit;

        const baseQuery = knex("report as r")
            .leftJoin("profile as reporter_p", "reporter_p.id", "r.reporter_id")
            .leftJoin("profile as reported_p", "reported_p.id", "r.reported_id");

        if (tab === "history") {
            baseQuery.whereIn("r.status", ["resolved", "appeal_resolved"]);
        } else if (tab !== "all") {
            const filter = getReportTypeFilterForTab(tab);
            if (!filter) {
                return res.status(400).json({ success: 0, msg: "잘못된 tab 값입니다." });
            }
            if (filter.exclude) {
                baseQuery.whereNotIn("r.report_type", filter.exclude);
            } else {
                baseQuery.where("r.report_type", filter.equals);
            }
        }

        const totalRow = await baseQuery.clone().count("r.report_id as count").first();
        const rows = await baseQuery
            .clone()
            .select(
                "r.report_id",
                "r.report_type",
                "r.category",
                "r.status",
                "r.resolution_type",
                "r.is_urgent",
                "r.target_type",
                "r.target_subtype",
                "r.report_time",
                knex.raw("LEFT(r.reason, 50) as reason_preview"),
                "reporter_p.nickname as reporter_nickname",
                "reported_p.nickname as reported_nickname"
            )
            .orderBy([
                { column: "r.is_urgent", order: "desc" },
                { column: "r.report_time", order: "asc" },
            ])
            .limit(limit)
            .offset(offset);

        return res.json({
            success: 1,
            reports: rows,
            pagination: { page, limit, total: Number(totalRow.count) },
        });
    })
);

// 탭별 미처리 건수(PHN-001 배지). /reports/:report_id보다 먼저 등록 — 안 그러면 "counts"가 report_id로 매칭됨.
router.get(
    "/reports/counts",
    requireAdminApi(async (req, res) => {
        const UNPROCESSED_STATUSES = ["pending", "ai_analyzing", "ai_done", "ai_failed", "reviewing"];
        const rows = await knex("report").whereIn("status", UNPROCESSED_STATUSES).select("report_type");
        const counts = { all: rows.length, report: 0, appeal: 0, feedback: 0, error: 0, other: 0 };
        for (const row of rows) {
            const tab = classifyReportTab(row.report_type);
            counts[tab] = (counts[tab] || 0) + 1;
        }
        return res.json({ success: 1, counts });
    })
);

// 신고 상세 조회(RPT-001~003). 신고 정보 + 신고자/피신고자 닉네임 + 최신 증거 스냅샷 + 처리 이력.
// 계정 신고 상세(RPT-004/005)의 봇/사칭 의심 신호, 이전 제재 이력 집계 등은 아직 미포함 — 후속 작업.
router.get(
    "/reports/:report_id",
    requireAdminApi(async (req, res) => {
        const report_id = parseInt(req.params.report_id, 10);
        if (isNaN(report_id)) {
            return res.status(400).json({ success: 0, msg: "잘못된 요청입니다." });
        }

        const report = await knex("report as r")
            .leftJoin("profile as reporter_p", "reporter_p.id", "r.reporter_id")
            .leftJoin("profile as reported_p", "reported_p.id", "r.reported_id")
            .leftJoin("user as reported_u", "reported_u.id", "r.reported_id")
            .where("r.report_id", report_id)
            .select(
                "r.*",
                "reporter_p.nickname as reporter_nickname",
                "reported_p.nickname as reported_nickname",
                "reported_u.status as reported_user_status",
                "reported_u.created_at as reported_user_created_at"
            )
            .first();

        if (!report) {
            return res.status(404).json({ success: 0, msg: "존재하지 않는 신고입니다." });
        }

        const evidenceSnapshot = await knex("report_evidence_snapshots")
            .where({ report_id })
            .orderBy("created_at", "desc")
            .first();

        const actions = await knex("report_actions as ra")
            .leftJoin("admins as a", "a.id", "ra.admin_id")
            .where("ra.report_id", report_id)
            .select("ra.id", "ra.action_type", "ra.memo", "ra.created_at", "a.name as admin_name")
            .orderBy("ra.created_at", "desc");

        return res.json({
            success: 1,
            report,
            evidence_snapshot: evidenceSnapshot || null,
            actions,
        });
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
