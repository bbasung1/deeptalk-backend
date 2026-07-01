-- report_actions.action_type enum에 신규 값 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 추가 배경 (cozy_admin_spec_v3 v1.2 RPT-006, 기획자 확인 2026-07-01):
-- - notice: 0단계 안내/조정. 기존 enum에 없었음.
-- - write_restricted: 2단계 글쓰기 제한. 기존 enum에 없었음.
-- 기존 값(warning/content_deleted/account_suspended/account_banned/dismissed/no_action)은 유지.
-- 명세서의 'ban' (4단계 영구정지)은 기획자 확인 결과 오기 — 기존 account_banned 그대로 사용.
-- 명세서의 'suspension' (3단계 일시정지)도 마찬가지로 기존 account_suspended 그대로 사용.
--
-- 함께 배포 필요: admin.js의 REPORT_ACTION_TO_STATUS, REPORT_ACTION_TO_RESOLUTION_TYPE 업데이트.
--
-- 주의: MySQL ENUM MODIFY 시 기존 데이터는 영향 없음 (값 추가만이므로 안전).

ALTER TABLE `report_actions`
    MODIFY COLUMN `action_type` ENUM(
        'notice',
        'warning',
        'write_restricted',
        'content_deleted',
        'account_suspended',
        'account_banned',
        'dismissed',
        'no_action'
    ) NOT NULL;
