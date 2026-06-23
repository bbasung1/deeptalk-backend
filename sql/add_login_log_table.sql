-- 로그인 시각/세션 데이터 수집을 위한 테이블 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
-- 보안 주의: access_token/refresh_token/id_token 등 민감한 값은 절대 저장하지 않음. 시각/플랫폼만 기록.

CREATE TABLE `login_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT 'user.id',
    `platform` VARCHAR(20) NOT NULL COMMENT 'kakao | apple | google | discord',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_created` (`user_id`, `created_at`),
    CONSTRAINT `fk_login_log_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
