-- 어드민이 유저에게 보내는 메시지(1:1 또는 공지) + 읽음 여부/시각 추적용 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- mention.is_read를 재사용하지 않는 이유: mention은 멘션 전용이고 읽은 "시각"이 없어서
-- "확인 여부·시각"을 둘 다 요구하는 이 항목에는 맞지 않음.
--
-- 공지(여러 유저 대상)는 보낼 때 유저마다 한 행씩 insert하는 방식으로 처리.
-- 같은 공지를 여러 명에게 보내도 각자 읽음 여부를 따로 추적할 수 있도록 group_id로 묶음.

CREATE TABLE `admin_message` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `group_id` CHAR(36) NOT NULL COMMENT '같은 발송 건(공지/1:1)을 묶는 식별자 (UUID). 공지면 여러 행이 같은 group_id를 가짐',
    `user_id` INT UNSIGNED NOT NULL COMMENT '받는 사람 (user.id)',
    `title` VARCHAR(100) NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발송 시각',
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `read_at` DATETIME NULL COMMENT '읽은 시각 (is_read=1일 때만 채움)',
    PRIMARY KEY (`id`),
    KEY `idx_user_created` (`user_id`, `created_at`),
    KEY `idx_group_id` (`group_id`),
    CONSTRAINT `fk_admin_message_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
