-- report 테이블에 긴급 플래그(is_urgent) 및 사건 요약(case_summary) 컬럼 추가.
-- 명세서(cozy_admin_spec_v3 v1.2) PHN-002, PHN-003, RPT-001 참고.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- is_urgent: AI 연동 전에는 운영팀이 신고 상세 화면 토글로 수동 설정.
--            AI Safety Triage 연동 후에는 위험 신호 감지 시 자동 설정.
-- case_summary: AI 연동 전에는 운영팀이 직접 입력하거나 비워둠.
--               AI Policy Analysis API 연동 후 자동 생성.

ALTER TABLE `report`
    ADD COLUMN `is_urgent` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '긴급 플래그. AI 연동 전: 운영팀 수동 토글. 연동 후: AI가 위험 신호 감지 시 자동 설정.'
        AFTER `resolution_type`,
    ADD COLUMN `case_summary` TEXT NULL
        COMMENT '사건 요약. AI 연동 전: 운영팀 직접 입력 또는 NULL. 연동 후: AI Policy Analysis API 자동 생성.'
        AFTER `is_urgent`;

-- 긴급 플래그 기준 정렬(PHN-002: 긴급 건 항상 최상단)을 위한 인덱스.
CREATE INDEX `idx_report_is_urgent` ON `report` (`is_urgent`);
