-- [AI 신고처리 기능 토대 3순위] 신고 시점의 콘텐츠 원문/맥락을 보존하는 스냅샷 구조.
-- 신고된 콘텐츠가 이후 수정/삭제되어도 신고 당시 상태를 어드민이 확인하고 AI가 분석할 수 있도록 함.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 실행 전 확인 필요: report.report_id 의 실제 컬럼 타입을 `DESCRIBE report;`로 확인하세요.
--
-- 보안 주의 (중요):
--   - `content_snapshot_raw`에는 신고 시점 원문이 그대로 들어가므로 개인정보/민감정보가 포함될
--     수 있습니다. 이 테이블 조회 API는 관리자 권한으로만 접근하도록 제한해야 합니다.
--   - `content_snapshot_masked`는 AI 분석에 넘기는 용도로, 개인정보(전화번호/주소/계정정보 등)를
--     마스킹한 버전을 저장합니다. 마스킹 로직 없이 원문을 그대로 복사해 넣지 마세요.
--   - `context_json`에는 주변 대화/작성자 정보 등을 담되, 토큰/비밀번호/결제정보 등은 절대
--     포함하지 마세요 (admin_audit_logs.sql의 동일 원칙 참고).
--   - winston 등 로그에 이 테이블의 컬럼 값을 그대로 찍지 않도록 주의 (로그 유출 시 개인정보 노출).

CREATE TABLE `report_evidence_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` INT UNSIGNED NOT NULL COMMENT 'report.report_id (실행 전 타입 확인 필요, 위 주석 참고)',
    `moderation_case_id` BIGINT UNSIGNED NULL COMMENT 'case 배정 후 채워짐 (moderation_cases.id)',
    `target_type` ENUM('content', 'account') NOT NULL COMMENT 'report와 동일 값 (조회 편의를 위한 비정규화)',
    `target_subtype` ENUM('talk', 'think', 'comment', 'quote', 'user_account', 'profile', 'bot_suspected', 'impersonation') NULL,
    `target_id` INT UNSIGNED NULL,
    `content_snapshot_raw` MEDIUMTEXT NULL COMMENT '신고 시점 원문 (관리자 전용 — 접근 제어 필수)',
    `content_snapshot_masked` MEDIUMTEXT NULL COMMENT 'AI 분석용 마스킹본',
    `context_json` JSON NULL COMMENT '작성자/작성시각/주변 대화 등 맥락 (민감정보 금지)',
    `visibility_status_snapshot` VARCHAR(30) NULL COMMENT '신고 시점 노출 상태 (예: visible, hidden, deleted)',
    `hidden_by_report` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '신고로 인해 일반 유저에게 비노출 처리되었는지',
    `hidden_by_admin` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '관리자가 별도로 숨김 처리했는지',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_report_id` (`report_id`),
    KEY `idx_moderation_case_id` (`moderation_case_id`),
    KEY `idx_target` (`target_type`, `target_subtype`, `target_id`),
    CONSTRAINT `fk_res_report` FOREIGN KEY (`report_id`) REFERENCES `report` (`report_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_res_case` FOREIGN KEY (`moderation_case_id`) REFERENCES `moderation_cases` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
