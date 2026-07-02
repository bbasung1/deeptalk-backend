-- report_actions.action_type에 unsuspend(정지 해제) 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- SYS-002 감사 로그 "기록 대상 액션"에 "정지해제"가 명시되어 있고, MBR-008 제재 액션의
-- "공통" 처리(users 상태 업데이트 + report_actions INSERT + admin_audit_logs INSERT)가
-- 정지 해제 버튼에도 동일하게 적용되므로 이 값이 필요하다.

ALTER TABLE `report_actions`
    MODIFY COLUMN `action_type` ENUM(
        'notice',
        'warning',
        'write_restricted',
        'content_deleted',
        'account_suspended',
        'account_banned',
        'dismissed',
        'no_action',
        'urgent_hide',
        'unsuspend'
    ) NOT NULL;
