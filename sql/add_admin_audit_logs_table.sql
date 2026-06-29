-- 어드민 운영 행위 추적용 감사 로그 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- admin_id를 NULL 허용으로 둔 이유: admin.js가 아직 개별 관리자 로그인을 구현하지 않아
-- (.env 공용 비밀번호 1개로만 로그인) 현재는 "어떤 관리자가 했는지"를 식별할 방법이 없음.
-- admin.js 개편 후 개별 로그인이 붙으면 admin_id를 채워서 기록하도록 변경할 것.
-- 보안 주의: detail에 비밀번호/토큰 등 민감정보를 절대 넣지 말 것.

CREATE TABLE `admin_audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `admin_id` INT UNSIGNED NULL COMMENT 'admins.id (개별 로그인 도입 전까지는 NULL 가능)',
    `action` VARCHAR(50) NOT NULL COMMENT '예: report_status_change, send_admin_message, suspend_user',
    `target_type` VARCHAR(30) NULL COMMENT '예: report, user, post',
    `target_id` VARCHAR(50) NULL COMMENT '대상 식별자 (테이블마다 PK 타입이 달라 문자열로 통일)',
    `detail` TEXT NULL COMMENT '행위에 대한 부가 설명 (민감정보 금지)',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_admin_created` (`admin_id`, `created_at`),
    KEY `idx_target` (`target_type`, `target_id`),
    CONSTRAINT `fk_admin_audit_logs_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
