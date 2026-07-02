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
    claimReport,
    classifyReportTab,
    getReportTypeFilterForTab,
} = require("./utils/reportActions.js");
const { isValidSanctionAction, applyMemberSanction } = require("./utils/userSanctions.js");

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
            .leftJoin("admins as assigned_a", "assigned_a.id", "r.assigned_admin_id")
            .where("r.report_id", report_id)
            .select(
                "r.*",
                "reporter_p.nickname as reporter_nickname",
                "reported_p.nickname as reported_nickname",
                "reported_u.status as reported_user_status",
                "reported_u.created_at as reported_user_created_at",
                "assigned_a.name as assigned_admin_name"
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

// RPT-010 "[처리하기]" 클릭 — 담당 운영팀으로 잠그고(동시 처리 방지), pending 등 검토 전이었으면 reviewing으로 전환.
// React가 상세 화면 진입 시 호출. 다른 운영팀이 이미 담당이면 409(REPORT_LOCKED).
router.post(
    "/reports/:report_id/claim",
    requireAdminApi(async (req, res) => {
        const report_id = parseInt(req.params.report_id, 10);
        if (isNaN(report_id)) {
            return res.status(400).json({ success: 0, msg: "잘못된 요청입니다." });
        }
        try {
            const report = await claimReport(knex, { report_id, adminId: req.admin.id });
            return res.json({ success: 1, status: report.status, assigned_admin_id: report.assigned_admin_id });
        } catch (err) {
            if (err.message === "REPORT_NOT_FOUND") {
                return res.status(404).json({ success: 0, msg: "존재하지 않는 신고입니다." });
            }
            if (err.message === "REPORT_LOCKED") {
                const lockedByAdmin = await knex("admins").where({ id: err.lockedBy }).first();
                return res.status(409).json({
                    success: 0,
                    msg: `${lockedByAdmin?.name || "다른 운영팀"}이(가) 처리 중인 신고입니다.`,
                });
            }
            console.error("Error in report claim API:", err);
            return res.status(500).json({ success: 0, msg: "서버 오류가 발생했습니다." });
        }
    })
);

// 신고 처리 액션 실행(RPT-006) — 승인/수정후승인은 이 엔드포인트를 그대로 호출(AI 연동 전에는 "수정 후"가
// 별도 로직을 필요로 하지 않아 프론트에서도 같은 API를 씀). 반려는 action_type='no_action', 긴급조치는
// action_type='urgent_hide'로 이 엔드포인트를 호출한다 — 전부 admin.js의 /admin/setblock/status(레거시
// HTML 폼)와 동일한 utils/reportActions.js를 공유한다. body: { action_type, memo, resolution_type, duration_hours }
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
            if (err.message === "REPORT_LOCKED") {
                const lockedByAdmin = await knex("admins").where({ id: err.lockedBy }).first();
                return res.status(409).json({
                    success: 0,
                    msg: `${lockedByAdmin?.name || "다른 운영팀"}이(가) 처리 중인 신고입니다.`,
                });
            }
            console.error("Error in report action API:", err);
            return res.status(500).json({ success: 0, msg: "서버 오류가 발생했습니다." });
        }
    })
);

// MBR-009 기간 만료 자동 해제. "배치 또는 API 호출 시점에 체크" 중 API 호출 시점 방식으로 구현 —
// 멤버 상세 조회할 때마다 만료된 제재를 정리한다. 원본 명세서 버전들 사이에 "다른 활성 제재 확인 후
// 재계산" vs "무조건 normal로 리셋"이 갈려서(admin 명세서 버전 미확정 — docs/admin_dev_priority.md 참고)
// 더 단순한 무조건 리셋 쪽으로 구현했다. 나중에 정책이 확정되면 여기만 고치면 됨.
async function autoReleaseExpiredSanctions(userId) {
    const user = await knex("user").where({ id: userId }).first();
    if (!user) return null;

    const update = {};
    if (user.suspended_until && new Date(user.suspended_until) < new Date()) {
        update.status = "normal";
        update.suspended_until = null;
    }
    if (user.write_restricted_until && new Date(user.write_restricted_until) < new Date()) {
        update.write_restricted_until = null;
    }
    if (Object.keys(update).length > 0) {
        await knex("user").where({ id: userId }).update(update);
        return { ...user, ...update };
    }
    return user;
}

function deriveProvider(user) {
    if (user.kakao_id) return "kakao";
    if (user.apple_id) return "apple";
    if (user.google_id) return "google";
    if (user.discord_id) return "discord";
    return null;
}

// 멤버 상세 조회(MBR-002~007, MBR-009). talk/think 합쳐서 "게시글"로 취급.
router.get(
    "/members/:user_id",
    requireAdminApi(async (req, res) => {
        const userId = parseInt(req.params.user_id, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ success: 0, msg: "잘못된 요청입니다." });
        }

        const user = await autoReleaseExpiredSanctions(userId);
        if (!user) {
            return res.status(404).json({ success: 0, msg: "존재하지 않는 유저입니다." });
        }
        const profile = await knex("profile").where({ id: userId }).first();

        // MBR-004 활동 요약. talk/think를 합쳐 "게시글"로, 인용은 quote 컬럼이 채워진 것만 카운트.
        const [talkStats] = await knex("talk")
            .where({ writer_id: userId })
            .whereNot("visibility_status", "deleted_by_user")
            .whereNot("visibility_status", "deleted_by_admin")
            .select(knex.raw("COUNT(*) as post_count"), knex.raw("SUM(CASE WHEN quote IS NOT NULL THEN 1 ELSE 0 END) as quote_count"));
        const [thinkStats] = await knex("think")
            .where({ writer_id: userId })
            .whereNot("visibility_status", "deleted_by_user")
            .whereNot("visibility_status", "deleted_by_admin")
            .select(knex.raw("COUNT(*) as post_count"), knex.raw("SUM(CASE WHEN quote IS NOT NULL THEN 1 ELSE 0 END) as quote_count"));
        const [commentCount] = await knex("comment").where({ writer_id: userId }).count("* as count");
        const [likeCount] = await knex("post_like").where({ user_id: userId }).whereNull("deleted_at").count("* as count");
        const [bookmarkCount] = await knex("bookmark").where({ user_id: userId }).whereNull("deleted_at").count("* as count");
        const [blockMuteByUserCount] = await knex("block_list").where({ user_id: userId }).count("* as count");

        // MBR-005 신고 현황
        const [receivedReports] = await knex("report").where({ reported_id: userId }).count("* as count");
        const [madeReports] = await knex("report").where({ reporter_id: userId }).count("* as count");
        const [blockedByOthersCount] = await knex("block_list").where({ blocked_user_id: userId }).count("* as count");

        // MBR-006 어드민 메시지 읽음 이력
        const messages = await knex("admin_messages as m")
            .where(function () {
                this.where("m.target_type", "all").orWhere("m.target_user_id", userId);
            })
            .leftJoin("admin_message_reads as r", function () {
                this.on("r.message_id", "m.id").andOn("r.user_id", knex.raw("?", [userId]));
            })
            .select("m.id", "m.title", "m.sent_at", knex.raw("r.read_at IS NOT NULL as is_read"))
            .orderBy("m.sent_at", "desc")
            .limit(50);

        // MBR-007 제재 이력 (READ ONLY)
        const sanctionRows = await knex("report_actions as ra")
            .leftJoin("admins as a", "a.id", "ra.admin_id")
            .where("ra.target_user_id", userId)
            .whereIn("ra.action_type", ["warning", "write_restricted", "account_suspended", "account_banned", "unsuspend"])
            .select("ra.id", "ra.action_type", "ra.memo", "ra.created_at", "a.name as admin_name")
            .orderBy("ra.created_at", "desc");
        const sanctionCountsByType = {};
        for (const row of sanctionRows) {
            sanctionCountsByType[row.action_type] = (sanctionCountsByType[row.action_type] || 0) + 1;
        }
        const [appealCount] = await knex("report")
            .where({ reporter_id: userId, report_type: "처분에 대해 이의를 제기하고 싶어요" })
            .count("* as count");
        const appealResolvedCount = await knex("report")
            .where({ reporter_id: userId, report_type: "처분에 대해 이의를 제기하고 싶어요", status: "appeal_resolved" })
            .count("* as count")
            .then(([r]) => r.count);

        return res.json({
            success: 1,
            member: {
                id: user.id,
                nickname: profile?.nickname || null,
                email: user.email,
                provider: deriveProvider(user),
                created_at: user.created_at,
                push_enabled: user.push_enabled,
                status: user.status,
                suspended_until: user.suspended_until,
                write_restricted_until: user.write_restricted_until,
                open_round: user.open_round,
                is_supporter: user.is_supporter,
                utm_source: user.utm_source,
                utm_medium: user.utm_medium,
                onboarding_started: user.onboarding_started,
                onboarding_completed: user.onboarding_completed,
                onboarding_drop_step: user.onboarding_drop_step,
                first_post_at: user.first_post_at,
                first_reaction_at: user.first_reaction_at,
            },
            activity: {
                post_count: Number(talkStats.post_count) + Number(thinkStats.post_count),
                comment_count: Number(commentCount.count),
                quote_count: Number(talkStats.quote_count || 0) + Number(thinkStats.quote_count || 0),
                reaction_count: Number(likeCount.count) + Number(bookmarkCount.count),
                block_mute_count: Number(blockMuteByUserCount.count),
            },
            reportStats: {
                received_count: Number(receivedReports.count),
                made_count: Number(madeReports.count),
                blocked_muted_count: Number(blockedByOthersCount.count),
            },
            messages,
            sanctionHistory: {
                total_count: sanctionRows.length,
                by_type: sanctionCountsByType,
                appeal_count: Number(appealCount.count),
                appeal_resolved_count: Number(appealResolvedCount),
                details: sanctionRows,
            },
        });
    })
);

// MBR-008 제재 액션 — 신고 처리와 무관하게 멤버 상세에서 직접 제재. body: { action, duration_hours, memo }
// action: warning/write_restricted/suspended/banned/unsuspend (utils/userSanctions.js의 SANCTION_ACTIONS)
router.post(
    "/members/:user_id/sanctions",
    requireAdminApi(async (req, res) => {
        const userId = parseInt(req.params.user_id, 10);
        const { action, duration_hours, memo } = req.body;
        if (isNaN(userId) || !isValidSanctionAction(action)) {
            return res.status(400).json({ success: 0, msg: "잘못된 요청입니다." });
        }
        try {
            await applyMemberSanction(knex, { userId, action, durationHours: duration_hours, memo, adminId: req.admin.id });
            await logAdminAction({
                adminId: req.admin.id,
                action: "member_sanction",
                target_type: "user",
                target_id: userId,
                detail: `action=${action}${duration_hours ? `, duration_hours=${duration_hours}` : ""}`,
            });
            return res.json({ success: 1 });
        } catch (err) {
            if (err.message === "USER_NOT_FOUND") {
                return res.status(404).json({ success: 0, msg: "존재하지 않는 유저입니다." });
            }
            console.error("Error in member sanction API:", err);
            return res.status(500).json({ success: 0, msg: "서버 오류가 발생했습니다." });
        }
    })
);

module.exports = router;
