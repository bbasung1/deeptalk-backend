// AI 모더레이션 기능 토대 (코드 레이어).
//
// 전제: 아래 SQL이 이미 이 브랜치에 커밋되어 DB에 적용되어 있어야 합니다.
//   - sql/add_report_target_generalization_columns.sql (report.target_type/target_subtype/target_id)
//   - sql/alter_report_status_enum.sql (report.status)
//   - sql/add_moderation_cases_table.sql (moderation_cases, moderation_case_reports)
//   - sql/add_report_evidence_snapshots_table.sql
//   - sql/add_report_ai_reviews_table.sql
//   - sql/add_admins_table.sql, sql/add_report_actions_table.sql
//   - sql/add_moderation_notification_link_columns.sql
//
// 이 파일은 report.js(일반 유저 신고 생성)에서 쓰는 헬퍼 함수들과, 어드민용 AI mock 엔드포인트를
// 함께 둡니다. admin.js는 곧 전면 개편될 예정이라 그쪽에 새 라우트를 추가하지 않고 이 파일을
// 별도로 마운트합니다 — admin.js 개편 시 인증 방식이 바뀌면 requireAdmin만 교체하면 됩니다.
//
// 실제 제재 수위/판단 기준, AI 프롬프트/모델 연동은 아직 정책이 확정되지 않아 포함하지 않았습니다.
// ai/* 엔드포인트는 지금은 mock 데이터만 반환합니다 (실제 OpenAI 등 외부 호출 없음).

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const knex = require("./knex.js");

router.use(express.json());

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

// report.js의 post_type -> moderation_cases / report.target_type / target_subtype 매핑.
// add_report_target_generalization_columns.sql / add_moderation_cases_table.sql의 ENUM 값과
// 반드시 일치해야 합니다 (둘이 어긋나면 병합 로직이 깨집니다).
const POST_TYPE_TO_TARGET = {
    talk: { target_type: "content", target_subtype: "talk" },
    think: { target_type: "content", target_subtype: "think" },
    comment: { target_type: "content", target_subtype: "comment" },
    user: { target_type: "account", target_subtype: "user_account" },
};

function mapPostTypeToTarget(post_type) {
    return POST_TYPE_TO_TARGET[post_type] || null;
}

// 같은 (target_type, target_subtype, target_id)의 미처리(pending/reviewing) case가 있으면 거기에 병합,
// 없으면(또는 기존 case가 resolved/dismissed면) 새 case 생성.
// resolved/dismissed case는 과거 처리 기록 보존을 위해 새 신고를 받지 않습니다.
async function findOrCreateModerationCase(trx, { target_type, target_subtype, target_id }) {
    if (!target_type || !target_id) {
        throw new Error("findOrCreateModerationCase: target_type/target_id가 필요합니다.");
    }
    const existing = await trx("moderation_cases")
        .where({ target_type, target_subtype, target_id })
        .whereIn("status", ["pending", "reviewing"])
        .first();
    if (existing) return existing.id;

    const [caseId] = await trx("moderation_cases").insert({
        target_type,
        target_subtype,
        target_id,
        status: "pending",
    });
    return caseId;
}

// moderation_case_reports.report_id가 UNIQUE라서, 신고 1건이 이미 다른 case에 연결되어 있으면
// 이 insert가 그대로 실패합니다(의도된 동작 — 신고 1건은 case 1개에만 속함).
async function linkReportToCase(trx, { moderation_case_id, report_id }) {
    await trx("moderation_case_reports").insert({ moderation_case_id, report_id });
}

// target_subtype 기준으로 신고 시점 원본 콘텐츠 조회 (스냅샷용).
// visibility_status는 스냅샷 컬럼(visibility_status_snapshot)에 별도 저장하기 위해 함께 조회.
async function fetchOriginalContent(trx, { target_subtype, target_id }) {
    if (!target_id) return null;
    if (target_subtype === "talk") {
        return trx("talk")
            .where("talk_num", target_id)
            .select("talk_num", "writer_id", "header", "subject", "timestamp", "visibility_status")
            .first();
    }
    if (target_subtype === "think") {
        return trx("think")
            .where("think_num", target_id)
            .select("think_num", "writer_id", "header", "subject", "timestamp", "visibility_status")
            .first();
    }
    if (target_subtype === "comment") {
        return trx("comment")
            .where("comment_num", target_id)
            .select("comment_num", "writer_id", "subject", "timestamp", "visibility_status")
            .first();
    }
    if (target_subtype === "user_account" || target_subtype === "profile") {
        return trx("profile")
            .where("id", target_id)
            .select("id", "user_id", "nickname", "status_msg")
            .first();
    }
    return null;
}

// AI 분석에 넘기기 전 PII 마스킹. 이메일/휴대폰/주민등록번호 패턴만 우선 처리 — 정책 확정 후 보강 필요.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const RRN_PATTERN = /\d{6}[-\s]?[1-4]\d{6}/g;

function maskString(value) {
    if (typeof value !== "string") return value;
    return value
        .replace(EMAIL_PATTERN, "[masked-email]")
        .replace(RRN_PATTERN, "[masked-id]")
        .replace(PHONE_PATTERN, "[masked-phone]");
}

function buildMaskedSnapshot(rawContent) {
    if (!rawContent || typeof rawContent !== "object") return rawContent;
    const masked = {};
    for (const [key, value] of Object.entries(rawContent)) {
        masked[key] = typeof value === "string" ? maskString(value) : value;
    }
    return masked;
}

// report_evidence_snapshots에 신고 시점 원문(raw, 관리자 전용)과 마스킹본(AI 분석용)을 함께 저장.
// raw_content는 로그(console/winston)에 그대로 출력하지 않도록 주의 — 이 함수 안에서도 출력하지 않음.
async function captureEvidenceSnapshot(trx, { report_id, moderation_case_id, target_type, target_subtype, target_id }) {
    const rawContent = await fetchOriginalContent(trx, { target_subtype, target_id });
    if (!rawContent) return null;

    // visibility_status는 스냅샷 전용 컬럼에 저장하고 content JSON에서는 제외.
    // user_account/profile은 visibility_status가 없으므로 undefined → 기본값 "visible" 처리.
    const { visibility_status: contentVisibility, ...contentOnly } = rawContent;
    const visibilitySnapshot = contentVisibility ?? "visible";

    const maskedContent = buildMaskedSnapshot(contentOnly);
    const [snapshotId] = await trx("report_evidence_snapshots").insert({
        report_id,
        moderation_case_id,
        target_type,
        target_subtype,
        target_id,
        content_snapshot_raw: JSON.stringify(contentOnly),
        content_snapshot_masked: JSON.stringify(maskedContent),
        context_json: JSON.stringify({ target_type, target_subtype, target_id }),
        visibility_status_snapshot: visibilitySnapshot,
    });
    return snapshotId;
}

// report.js에서 호출하는 엔트리포인트. trx 안에서 호출되어야 신고 INSERT와 함께 원자적으로 처리됩니다.
async function processReportForModeration(trx, { report_id, post_type, target_id }) {
    const target = mapPostTypeToTarget(post_type);
    if (!target || !target_id) return null;

    const { target_type, target_subtype } = target;
    const moderation_case_id = await findOrCreateModerationCase(trx, { target_type, target_subtype, target_id });
    await linkReportToCase(trx, { moderation_case_id, report_id });
    await captureEvidenceSnapshot(trx, { report_id, moderation_case_id, target_type, target_subtype, target_id });
    return moderation_case_id;
}

// --- 어드민용 mock AI 엔드포인트 ---
// admin.js는 .env 단일 공용 비밀번호 + 메모리 세션 구조라 새 엔드포인트를 거기 추가하지 않고,
// 임시로 별도 API 키 인증을 둡니다. admin.js 개편(개별 관리자 로그인) 후 교체할 것.
function requireAdmin(req, res, next) {
    const expected = process.env.ADMIN_API_KEY;
    const provided = req.headers["x-admin-api-key"];
    if (!expected) {
        console.error("ADMIN_API_KEY가 설정되지 않았습니다.");
        return res.status(500).json({ success: false, message: "서버 설정 오류" });
    }
    if (typeof provided !== "string" || provided.length !== expected.length) {
        return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }
    const ok = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    next();
}

function parseCaseId(req, res) {
    const caseId = Number(req.params.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
        res.status(400).json({ success: false, message: "유효하지 않은 caseId입니다." });
        return null;
    }
    return caseId;
}

router.get("/cases/:caseId", requireAdmin, async (req, res) => {
    try {
        const caseId = parseCaseId(req, res);
        if (caseId === null) return;

        const moderationCase = await knex("moderation_cases").where("id", caseId).first();
        if (!moderationCase) {
            return res.status(404).json({ success: false, message: "case를 찾을 수 없습니다." });
        }
        const reports = await knex("moderation_case_reports")
            .join("report", "report.report_id", "moderation_case_reports.report_id")
            .where("moderation_case_reports.moderation_case_id", caseId)
            .select("report.report_id", "report.reporter_id", "report.report_type", "report.reason", "report.category");
        const latestReview = await knex("report_ai_reviews")
            .where("moderation_case_id", caseId)
            .orderBy("created_at", "desc")
            .first();

        res.json({ success: true, case: moderationCase, reports, latest_ai_review: latestReview || null });
    } catch (err) {
        console.error("🚨 case 조회 중 오류:", err);
        res.status(500).json({ success: false, message: "서버 내부 오류" });
    }
});

async function insertMockAiReview(caseId, overrides) {
    const base = {
        moderation_case_id: caseId,
        policy_version: "mock-v1",
        prompt_version: "mock-v1",
        triage_result_json: JSON.stringify({ mock: true }),
        analysis_result_json: null,
        risk_level: 1,
        case_family: "general",
        primary_case_type: "uncategorized",
        recommended_queue: "manual_review",
        recommended_action: null,
        severity_level: null,
        confidence: 0.5,
        context_expansion_needed: 0,
    };
    const payload = { ...base, ...overrides };
    const [id] = await knex("report_ai_reviews").insert(payload);
    return { id, ...payload };
}

router.post("/cases/:caseId/ai/triage", requireAdmin, async (req, res) => {
    try {
        const caseId = parseCaseId(req, res);
        if (caseId === null) return;
        const moderationCase = await knex("moderation_cases").where("id", caseId).first();
        if (!moderationCase) {
            return res.status(404).json({ success: false, message: "case를 찾을 수 없습니다." });
        }
        const review = await insertMockAiReview(caseId, {
            triage_result_json: JSON.stringify({ mock: true, stage: "triage" }),
        });
        res.json({ success: true, ai_review: review });
    } catch (err) {
        console.error("🚨 AI triage(mock) 처리 중 오류:", err);
        res.status(500).json({ success: false, message: "서버 내부 오류" });
    }
});

router.post("/cases/:caseId/ai/analyze", requireAdmin, async (req, res) => {
    try {
        const caseId = parseCaseId(req, res);
        if (caseId === null) return;
        const moderationCase = await knex("moderation_cases").where("id", caseId).first();
        if (!moderationCase) {
            return res.status(404).json({ success: false, message: "case를 찾을 수 없습니다." });
        }
        const review = await insertMockAiReview(caseId, {
            analysis_result_json: JSON.stringify({ mock: true, stage: "analyze" }),
            context_expansion_needed: 0,
        });
        res.json({ success: true, ai_review: review });
    } catch (err) {
        console.error("🚨 AI analyze(mock) 처리 중 오류:", err);
        res.status(500).json({ success: false, message: "서버 내부 오류" });
    }
});

// 아래 두 엔드포인트는 정책/프롬프트가 확정되지 않아 결과를 DB에 저장하지 않고 mock 응답만 반환합니다
// (어드민 UI에서 AI 카드 자리(placeholder)를 미리 붙여볼 수 있도록 하는 용도).
router.post("/cases/:caseId/ai/context-expansion", requireAdmin, async (req, res) => {
    const caseId = parseCaseId(req, res);
    if (caseId === null) return;
    res.json({ success: true, mock: true, expanded_context: null, message: "정책 확정 전 mock 응답입니다." });
});

router.post("/cases/:caseId/ai/regenerate-notice", requireAdmin, async (req, res) => {
    const caseId = parseCaseId(req, res);
    if (caseId === null) return;
    res.json({ success: true, mock: true, draft_text: null, message: "정책 확정 전 mock 응답입니다." });
});

module.exports = router;
module.exports.mapPostTypeToTarget = mapPostTypeToTarget;
module.exports.findOrCreateModerationCase = findOrCreateModerationCase;
module.exports.linkReportToCase = linkReportToCase;
module.exports.captureEvidenceSnapshot = captureEvidenceSnapshot;
module.exports.processReportForModeration = processReportForModeration;
module.exports.buildMaskedSnapshot = buildMaskedSnapshot;
