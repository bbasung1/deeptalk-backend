// 신고 처리 액션(RPT-006)의 핵심 트랜잭션 로직. admin.js(레거시 HTML 폼)와 admin_api.js(신규 JSON API,
// React 프론트엔드용) 양쪽에서 공유한다 — 처리 상태/제재/콘텐츠 삭제 로직이 두 곳에서 따로 구현되면
// 한쪽만 고치고 잊어버리는 사고가 나기 쉬워서 여기로 모았다.
// 설계 근거: docs/admin_report_action_spec.md 참고.

const REPORT_ACTION_TO_STATUS = {
    notice: "resolved",
    warning: "resolved",
    write_restricted: "resolved",
    content_deleted: "resolved",
    account_suspended: "resolved",
    account_banned: "resolved",
    dismissed: "resolved",
    no_action: "reviewing",
};

// action_type → resolution_type 매핑. null이면 report.resolution_type을 갱신하지 않는다
// (no_action은 resolved가 아니므로 NULL 유지). dismissed는 요청의 resolution_type 값으로 별도 결정.
const REPORT_ACTION_TO_RESOLUTION_TYPE = {
    notice: "notice_only",
    warning: "action_taken",
    write_restricted: "action_taken",
    content_deleted: "action_taken",
    account_suspended: "action_taken",
    account_banned: "action_taken",
    dismissed: null,
    no_action: null,
};

// [무혐의] 선택 시 드롭다운으로 고를 수 있는 세부 사유 (기획자 확인 2026-07-01).
const DISMISSED_RESOLUTION_TYPES = new Set(["dismissed", "duplicate", "insufficient_evidence"]);

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

// 신고 처리 액션 1건을 적용한다: report.status/resolution_type 갱신, report_actions 기록,
// (해당하면) 대상 유저 제재, (해당하면) 대상 콘텐츠 숨김/삭제. 전부 하나의 트랜잭션으로 묶는다.
//
// 실패 시 Error를 던진다 — message로 "REPORT_NOT_FOUND"를 구분해서 호출부가 404/에러 페이지를 고를 수 있게 함.
// 감사 로그(admin_audit_logs) 기록은 호출부 책임 — admin.js/admin_api.js가 각자 쓰는 방식이 달라서
// (하나는 응답 후 로그, 하나는 JSON 응답 전 로그 등) 이 함수 안에서 강제하지 않는다.
async function applyReportAction(knex, { report_id, action_type, memo, resolutionTypeOverride, durationHours, adminId }) {
    if (!isValidActionType(action_type)) {
        throw new Error(`INVALID_ACTION_TYPE: ${action_type}`);
    }

    const report = await knex("report").where({ report_id }).first();
    if (!report) {
        throw new Error("REPORT_NOT_FOUND");
    }

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

    const hours = normalizeDurationHours(durationHours);

    await knex.transaction(async (trx) => {
        await trx("report").where("report_id", report_id).update(reportUpdate);

        await trx("report_actions").insert({
            report_id,
            admin_id: adminId,
            action_type,
            memo: memo || null,
        });

        // 계정 제재 — report.reported_id(신고 대상 유저)의 상태를 갱신한다.
        // report.js가 reported_id를 콘텐츠 작성자(또는 계정 신고 대상)의 user.id로 채워서 저장하므로 그대로 사용.
        if (report.reported_id) {
            const userUpdate = {};
            if (action_type === "warning") {
                userUpdate.status = "warned";
            } else if (action_type === "write_restricted" && hours) {
                userUpdate.write_restricted_until = trx.raw("DATE_ADD(NOW(), INTERVAL ? HOUR)", [hours]);
            } else if (action_type === "account_suspended") {
                userUpdate.status = "suspended";
                if (hours) {
                    userUpdate.suspended_until = trx.raw("DATE_ADD(NOW(), INTERVAL ? HOUR)", [hours]);
                }
            } else if (action_type === "account_banned") {
                userUpdate.status = "banned";
            }
            if (Object.keys(userUpdate).length > 0) {
                await trx("user").where({ id: report.reported_id }).update(userUpdate);
            }
        }

        // 콘텐츠 삭제 — report.target_subtype/target_id 기준으로 실제 콘텐츠의 visibility_status를 갱신한다.
        if (action_type === "content_deleted" && report.target_id && CONTENT_TABLE_BY_SUBTYPE[report.target_subtype]) {
            const { table, idColumn } = CONTENT_TABLE_BY_SUBTYPE[report.target_subtype];
            await trx(table).where(idColumn, report.target_id).update({ visibility_status: "deleted_by_admin" });
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
    classifyReportTab,
    getReportTypeFilterForTab,
};
