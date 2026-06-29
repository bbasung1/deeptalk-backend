-- 푸시 알림 발송 데이터 수집용 로그 테이블 (fcm.js에서 알림을 보낼 때마다 기록).
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- fcm_tokens(기존 fcm_token 테이블)는 "현재 등록된 토큰"만 관리하고 발송 이력이 없어서,
-- 발송 건수/성공률 등을 분석하려면 이 별도 로그가 필요함.
-- 보안 주의: fcm_token 값(토큰 문자열) 자체는 여기에 저장하지 않음. 누구에게, 어떤 종류로,
-- 언제, 성공했는지만 기록.

CREATE TABLE `push_notifications` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT '수신자 (user.id)',
    `notification_type` VARCHAR(30) NOT NULL COMMENT '예: post, reaction, mention, admin_message',
    `title` VARCHAR(200) NULL,
    `is_success` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_created` (`user_id`, `created_at`),
    KEY `idx_type_created` (`notification_type`, `created_at`),
    CONSTRAINT `fk_push_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
