// 어드민 운영 행위 감사 로그(admin_audit_logs) 기록 헬퍼.
// admin.js(쿠키/HTML)와 admin_api.js(Bearer/JSON) 양쪽에서 공유하므로 여기로 분리했다.
// adminId는 호출부에서 req.admin.id(utils/adminAuth.js 인증 결과)를 넘겨준다.
// detail에는 비밀번호/토큰 등 민감정보를 절대 넣지 말 것 — 이 함수를 호출하는 곳에서 직접 주의해야 함.
// 감사 로그 기록 실패가 본래 동작(신고 처리, 메시지 발송 등)을 막아서는 안 되므로 에러는 흡수만 함.
const knex = require("../knex.js");

async function logAdminAction({ adminId = null, action, target_type = null, target_id = null, detail = null }) {
    try {
        await knex("admin_audit_logs").insert({
            admin_id: adminId,
            action,
            target_type,
            target_id: target_id === null || target_id === undefined ? null : String(target_id),
            detail,
        });
    } catch (err) {
        console.error("Error in logAdminAction:", err);
    }
}

module.exports = { logAdminAction };
