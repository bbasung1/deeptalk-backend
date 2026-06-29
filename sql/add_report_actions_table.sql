-- 신고 처리 내역(어드민이 신고에 대해 어떤 조치를 했는지) 기록용 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 실행 전 확인 필요: report.report_id 의 실제 컬럼 타입을 `DESCRIBE report;`로 확인하고
-- 아래 report_id 컬럼 타입을 그대로 맞춰주세요. FK 타입이 다르면 errno 150으로 실패합니다.
-- (참고: 이 프로젝트의 다른 PK들은 INT UNSIGNED인 경우가 많았음 — profile.id 등)
--
-- admin_id를 NULL 허용으로 둔 이유: add_admin_audit_logs_table.sql과 동일 (개별 관리자 로그인 미구현).

CREATE TABLE `report_actions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` INT UNSIGNED NOT NULL COMMENT 'report.report_id (실행 전 타입 확인 필요, 위 주석 참고)',
    `admin_id` INT UNSIGNED NULL COMMENT 'admins.id (개별 로그인 도입 전까지는 NULL 가능)',
    `action_type` ENUM('warning', 'content_deleted', 'account_suspended', 'account_banned', 'dismissed', 'no_action') NOT NULL,
    `memo` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_report_id` (`report_id`),
    CONSTRAINT `fk_report_actions_report` FOREIGN KEY (`report_id`) REFERENCES `report` (`report_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_report_actions_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
