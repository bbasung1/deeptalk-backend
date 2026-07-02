// user 테이블에 실제로 제재를 적용하는 순수 로직. 신고 처리 경로(utils/reportActions.js)와
// 멤버 상세 페이지의 직접 제재 경로(admin_api.js의 /members/:id/sanctions) 양쪽에서 공유한다 —
// "경고면 status=warned", "정지면 duration만큼 suspended_until" 같은 규칙이 두 곳에 따로 있으면
// 한쪽만 고치는 사고가 나기 쉬워서 여기로 모았다.

const SANCTION_ACTIONS = ["warning", "write_restricted", "suspended", "banned", "unsuspend"];

function isValidSanctionAction(action) {
    return SANCTION_ACTIONS.includes(action);
}

function normalizeDurationHours(durationHours) {
    const n = Number(durationHours);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// trx(또는 knex)와 액션/기간을 받아 user 테이블 update 객체를 만든다. DB에 쓰지는 않음 —
// 호출부가 트랜잭션 안에서 원하는 시점에 직접 .update()하도록 분리했다(다른 쓰기와 원자적으로 묶기 위함).
function buildUserSanctionUpdate(trx, action, durationHours) {
    if (!isValidSanctionAction(action)) {
        throw new Error(`INVALID_SANCTION_ACTION: ${action}`);
    }
    const hours = normalizeDurationHours(durationHours);

    switch (action) {
        case "warning":
            return { status: "warned" };
        case "write_restricted":
            return hours ? { write_restricted_until: trx.raw("DATE_ADD(NOW(), INTERVAL ? HOUR)", [hours]) } : {};
        case "suspended": {
            const update = { status: "suspended" };
            if (hours) update.suspended_until = trx.raw("DATE_ADD(NOW(), INTERVAL ? HOUR)", [hours]);
            return update;
        }
        case "banned":
            return { status: "banned" };
        case "unsuspend":
            // MBR-008 정지 해제. 원본 명세서 기준 복수 제재 존재 여부 확인 로직은 확정 안 됨(admin 명세서
            // 버전 문제로 보류 — docs/admin_dev_priority.md 참고) — 지금은 무조건 normal로 리셋하는
            // 단순한 쪽으로 구현. 나중에 정책이 확정되면 여기만 고치면 됨.
            return { status: "normal", suspended_until: null, write_restricted_until: null };
        default:
            return {};
    }
}

// SANCTION_ACTIONS 값 -> report_actions.action_type ENUM 값. 이름이 서로 다른 이유:
// report_actions.action_type은 report.js 신고 처리 흐름(RPT-006)에서 먼저 정해진 이름이라
// account_suspended/account_banned처럼 "account_" 접두어가 붙어있음. 여기 값들과는 안 맞아서 매핑이 필요.
const SANCTION_ACTION_TO_REPORT_ACTION_TYPE = {
    warning: "warning",
    write_restricted: "write_restricted",
    suspended: "account_suspended",
    banned: "account_banned",
    unsuspend: "unsuspend",
};

// MBR-008 "멤버 상세에서 신고 없이 직접 제재" 경로. report_id 없이 report_actions에 기록한다
// (target_user_id만 채움 — sql/alter_report_actions_add_target_user_and_urgent_hide.sql 참고).
// 감사 로그(admin_audit_logs) 기록은 applyReportAction과 동일하게 호출부 책임으로 남겨둔다.
async function applyMemberSanction(knex, { userId, action, durationHours, memo, adminId }) {
    if (!isValidSanctionAction(action)) {
        throw new Error(`INVALID_SANCTION_ACTION: ${action}`);
    }
    const user = await knex("user").where({ id: userId }).first();
    if (!user) {
        throw new Error("USER_NOT_FOUND");
    }

    await knex.transaction(async (trx) => {
        const update = buildUserSanctionUpdate(trx, action, durationHours);
        if (Object.keys(update).length > 0) {
            await trx("user").where({ id: userId }).update(update);
        }
        await trx("report_actions").insert({
            report_id: null,
            admin_id: adminId,
            target_user_id: userId,
            action_type: SANCTION_ACTION_TO_REPORT_ACTION_TYPE[action],
            memo: memo || null,
        });
    });

    return { userId, action };
}

module.exports = {
    SANCTION_ACTIONS,
    SANCTION_ACTION_TO_REPORT_ACTION_TYPE,
    isValidSanctionAction,
    normalizeDurationHours,
    buildUserSanctionUpdate,
    applyMemberSanction,
};
