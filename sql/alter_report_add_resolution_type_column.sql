-- report.resolution_type 컬럼 추가.
-- 명세서(cozy_admin_spec_v3 v1.2) PHN-004/RPT-006 참고.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 역할 분리: report.status는 "어디까지 처리됐나" 라이프사이클만 담당 (sql/alter_report_status_enum_v2.sql 참고).
-- resolution_type은 "처리 결과가 무엇이었나"를 담당. status가 resolved/appeal_resolved일 때만 값이 채워지고,
-- 그 외(pending/reviewing 등) 상태에서는 NULL.
--
-- 주의(범위 밖): report_actions.action_type → resolution_type 매핑 로직(admin.js)과
-- action_type enum에 notice/write_restricted 등 신규 값 추가는 이번 작업 범위에서 제외.
-- 현재 action_type enum(warning/content_deleted/account_suspended/account_banned/dismissed/no_action)으로는
-- RPT-006의 0단계(안내/조정)·2단계(글쓰기 제한)를 그대로 표현할 수 없으므로, 별도 작업에서 다룰 것.

ALTER TABLE `report`
    ADD COLUMN `resolution_type` ENUM(
        'action_taken',
        'dismissed',
        'notice_only',
        'duplicate',
        'insufficient_evidence'
    ) NULL DEFAULT NULL
    COMMENT '처리 결과 구분. status가 resolved/appeal_resolved일 때만 값 존재 (PHN-004 참고)'
    AFTER `status`;
