// 신고 처리 액션(RPT-006)의 핵심 트랜잭션 로직. admin.js(레거시 HTML 폼)와 admin_api.js(신규 JSON API,
// React 프론트엔드용) 양쪽에서 공유한다 — 처리 상태/제재/콘텐츠 삭제 로직이 두 곳에서 따로 구현되면
// 한쪽만 고치고 잊어버리는 사고가 나기 쉬워서 여기로 모았다.
// 설계 근거: docs/admin_report_action_spec.md 참고.

const { buildUserSanctionUpdate } = require("./userSanctions.js");

const REPORT_ACTION_TO_STATUS = {
    notice: "resolved",
    warning: "resolved",
    write_restricted: "resolved",
    content_deleted: "resolved",
    account_suspended: "resolved",
    account_banned: "resolved",
    dismissed: "resolved",
    no_action: "reviewing",
    // RPT-010 "긴급 조치" — 콘텐츠만 즉시 숨기고 케이스는 reviewing 유지(확정 아님).
    urgent_hide: "reviewing",
};

// action_type → resolution_type 매핑. null이면 report.resolution_type을 갱신하지 않는다
// (no_action/urgent_hide는 resolved가 아니므로 NULL 유지). dismissed는 요청의 resolution_type 값으로 별도 결정.
const REPORT_ACTION_TO_RESOLUTION_TYPE = {
    notice: "notice_only",
    warning: "action_taken",
    write_restricted: "action_taken",
    content_deleted: "action_taken",
    account_suspended: "action_taken",
    account_banned: "action_taken",
    dismissed: null,
    no_action: null,
    urgent_hide: null,
};

// action_type → utils/userSanctions.js의 SANCTION_ACTIONS 값. 매핑에 없으면 유저 상태를 안 건드림.
const ACTION_TYPE_TO_SANCTION = {
    warning: "warning",
    write_restricted: "write_restricted",
    account_suspended: "suspended",
    account_banned: "banned",
};

// action_type → 콘텐츠 visibility_status. content_deleted는 관리자 삭제, urgent_hide는 임시 숨김(삭제 아님).
const CONTENT_VISIBILITY_BY_ACTION = {
    content_deleted: "deleted_by_admin",
    urgent_hide: "hidden_by_admin",
};

// [무혐의] 선택 시 드롭다운으로 고를 수 있는 세부 사유 (기획자 확인 2026-07-01).
const DISMISSED_RESOLUTION_TYPES = new Set(["dismissed", "duplicate", "insufficient_evidence"]);

// 처리하기 클릭 시(claimReport) reviewing으로 전환 대상이 되는, "아직 아무도 안 본" 상태들.
// 이미 reviewing 이후 단계(resolved 등)인 케이스는 재클레임해도 상태를 되돌리지 않는다.
const PRE_REVIEW_STATUSES = ["pending", "ai_analyzing", "ai_done", "ai_failed"];

// PHN-001 탭 분류. 원본 명세서는 report_type을 'report'/'appeal'/'feedback'/'error'/'other' 같은
// 깔끔한 enum으로 가정했지만, 실제 report.js는 앱 UI에서 고른 한국어 문구를 report_type에 그대로 저장한다
// (예: "욕설", "게시물신고", "오류가 있어요"). 그래서 report.js의 none_post_report_types와 동일한
// 문자열 목록으로 탭을 분류한다 — 두 목록이 어긋나면 새 신고 유형이 엉뚱한 탭에 들어갈 수 있으니
// report.js에서 이 목록을 가져다 쓰게 해서 하나로 유지한다.
const REPORT_TYPE_TAB_MAP = {
    "처분에 대해 이의를 제기하고 싶어요": "appeal",
    "클럽에게 피드백 하고 싶어요": "feedback",
    "오류가 있어요": "error",
    "기타": "other",
};
// report.js가 post_id 없이 접수하는(콘텐츠에 안 달리는) 신고 유형 전체.
// "유저를 신고하고 싶어요"는 계정 신고라 post_id는 없지만 탭 분류는 "report"로 남는다(REPORT_TYPE_TAB_MAP에 없음).
const NONE_POST_REPORT_TYPES = [...Object.keys(REPORT_TYPE_TAB_MAP), "유저를 신고하고 싶어요"];

// report_type 문자열 -> PHN-001 탭. 위 4개 특수 유형이 아니면 전부 "report"(신고) 탭.
function classifyReportTab(report_type) {
    return REPORT_TYPE_TAB_MAP[report_type] || "report";
}

// 탭 -> report_type 필터. "report"는 특정 문자열이 아니라 "4개 특수 유형이 아닌 전부"이므로
// { exclude: [...] } 형태로, 나머지는 { equals: "..." } 형태로 반환해서 호출부가 where/whereNotIn을 고르게 한다.
function getReportTypeFilterForTab(tab) {
    if (tab === "report") {
        return { exclude: Object.keys(REPORT_TYPE_TAB_MAP) };
    }
    const reportType = Object.keys(REPORT_TYPE_TAB_MAP).find((key) => REPORT_TYPE_TAB_MAP[key] === tab);
    return reportType ? { equals: reportType } : null;
}

// report.target_subtype -> 실제 콘텐츠 테이블/PK 컬럼. user_account/profile은 계정 신고라 콘텐츠 삭제 대상이 아님.
// quote/bot_suspected/impersonation은 report.js의 신고 생성 플로우에서 아직 발급되지 않는 값이라(post_type이
// think/talk/comment/user로만 제한됨) 지금은 talk/think/comment 세 가지만 처리하면 충분하다.
const CONTENT_TABLE_BY_SUBTYPE = {
    talk: { table: "talk", idColumn: "talk_num" },
    think: { table: "think", idColumn: "think_num" },
    comment: { table: "comment", idColumn: "comment_num" },
};

function isValidActionType(action_type) {
    return Object.prototype.hasOwnProperty.call(REPORT_ACTION_TO_STATUS, action_type);
}

// "3일/7일/30일/직접입력" 중 프리셋은 호출부(폼/프론트)에서 시간(hour) 단위로 환산해 넘긴다고 가정.
// 직접입력도 명세서상 시간 단위이므로 durationHours 하나로 통일 — 백엔드는 프리셋 개념을 모른다.
function normalizeDurationHours(durationHours) {
    const n = Number(durationHours);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// report.assigned_admin_id가 다른 운영팀으로 잠겨있으면 에러를 던진다. 잠금 없음(NULL) 또는
// 본인이 이미 담당인 경우는 통과 — "처리하기"로 먼저 클레임 안 해도 첫 액션이 암묵적 클레임 역할을 하므로
// 레거시 admin.js 폼(클레임 개념 자체가 없음)도 그대로 동작한다.
function assertNotLockedByOther(report, adminId) {
    if (report.assigned_admin_id && report.assigned_admin_id !== adminId) {
        const err = new Error("REPORT_LOCKED");
        err.lockedBy = report.assigned_admin_id;
        throw err;
    }
}

// RPT-010 "[처리하기]" 클릭 — 담당 운영팀으로 잠그고(동시 처리 방지), 아직 검토 전 상태였다면 reviewing으로 전환.
// 이미 본인이 담당이면 그대로 통과(멱등), 다른 운영팀이 담당이면 REPORT_LOCKED 에러.
async function claimReport(knex, { report_id, adminId }) {
    return knex.transaction(async (trx) => {
        const report = await trx("report").where({ report_id }).first();
        if (!report) throw new Error("REPORT_NOT_FOUND");
        assertNotLockedByOther(report, adminId);

        const update = { assigned_admin_id: adminId };
        if (PRE_REVIEW_STATUSES.includes(report.status)) {
            update.status = "reviewing";
        }
        await trx("report").where({ report_id }).update(update);
        return { ...report, ...update };
    });
}

// 신고 처리 액션 1건을 적용한다: report.status/resolution_type 갱신, report_actions 기록,
// (해당하면) 대상 유저 제재, (해당하면) 대상 콘텐츠 숨김/삭제. 전부 하나의 트랜잭션으로 묶는다.
//
// 실패 시 Error를 던진다 — message로 "REPORT_NOT_FOUND"/"REPORT_LOCKED"를 구분해서 호출부가
// 404/409를 고를 수 있게 함. 감사 로그(admin_audit_logs) 기록은 호출부 책임 — admin.js/admin_api.js가
// 각자 쓰는 방식이 달라서(하나는 응답 후 로그, 하나는 JSON 응답 전 로그 등) 이 함수 안에서 강제하지 않는다.
async function applyReportAction(knex, { report_id, action_type, memo, resolutionTypeOverride, durationHours, adminId }) {
    if (!isValidActionType(action_type)) {
        throw new Error(`INVALID_ACTION_TYPE: ${action_type}`);
    }

    const report = await knex("report").where({ report_id }).first();
    if (!report) {
        throw new Error("REPORT_NOT_FOUND");
    }
    assertNotLockedByOther(report, adminId);

    const status = REPORT_ACTION_TO_STATUS[action_type];

    let resolution_type;
    if (action_type === "dismissed") {
        resolution_type = DISMISSED_RESOLUTION_TYPES.has(resolutionTypeOverride) ? resolutionTypeOverride : "dismissed";
    } else {
        resolution_type = REPORT_ACTION_TO_RESOLUTION_TYPE[action_type];
    }

    const reportUpdate = { status };
    if (resolution_type !== null && resolution_type !== undefined) {
        reportUpdate.resolution_type = resolution_type;
    }
    // 반려(no_action) — 처리 보류, 다른 운영팀이 재처리할 수 있게 잠금을 풀어준다.
    if (action_type === "no_action") {
        reportUpdate.assigned_admin_id = null;
    } else if (!report.assigned_admin_id) {
        // 클레임 없이 바로 액션한 경우(레거시 폼 등) — 처리한 사람 기준으로 암묵적 클레임.
        reportUpdate.assigned_admin_id = adminId;
    }

    const hours = normalizeDurationHours(durationHours);

    await knex.transaction(async (trx) => {
        await trx("report").where("report_id", report_id).update(reportUpdate);

        await trx("report_actions").insert({
            report_id,
            admin_id: adminId,
            target_user_id: report.reported_id || null,
            action_type,
            memo: memo || null,
        });

        // 계정 제재 — report.reported_id(신고 대상 유저)의 상태를 갱신한다.
        // report.js가 reported_id를 콘텐츠 작성자(또는 계정 신고 대상)의 user.id로 채워서 저장하므로 그대로 사용.
        const sanctionAction = ACTION_TYPE_TO_SANCTION[action_type];
        if (report.reported_id && sanctionAction) {
            const userUpdate = buildUserSanctionUpdate(trx, sanctionAction, hours);
            if (Object.keys(userUpdate).length > 0) {
                await trx("user").where({ id: report.reported_id }).update(userUpdate);
            }
        }

        // 콘텐츠 숨김/삭제 — report.target_subtype/target_id 기준으로 실제 콘텐츠의 visibility_status를 갱신한다.
        const contentVisibility = CONTENT_VISIBILITY_BY_ACTION[action_type];
        if (contentVisibility && report.target_id && CONTENT_TABLE_BY_SUBTYPE[report.target_subtype]) {
            const { table, idColumn } = CONTENT_TABLE_BY_SUBTYPE[report.target_subtype];
            await trx(table).where(idColumn, report.target_id).update({ visibility_status: contentVisibility });
        }
    });

    return { status, resolution_type, report };
}

module.exports = {
    REPORT_ACTION_TO_STATUS,
    REPORT_ACTION_TO_RESOLUTION_TYPE,
    DISMISSED_RESOLUTION_TYPES,
    NONE_POST_REPORT_TYPES,
    isValidActionType,
    applyReportAction,
    claimReport,
    classifyReportTab,
    getReportTypeFilterForTab,
};
