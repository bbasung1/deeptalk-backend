-- 유저 언급(mention) 기능을 위한 테이블 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.

CREATE TABLE `mention` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `mentioner_id` INT UNSIGNED NOT NULL COMMENT '멘션을 작성한 사람 (profile.id)',
    `mentioned_id` INT UNSIGNED NOT NULL COMMENT '멘션 당한 사람 (profile.id)',
    `post_type` TINYINT NOT NULL COMMENT '0:talk, 1:think, 2:comment',
    `post_num` INT NOT NULL COMMENT 'talk_num/think_num/comment_num',
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_mentioned_id` (`mentioned_id`, `timestamp`),
    CONSTRAINT `fk_mention_mentioner` FOREIGN KEY (`mentioner_id`) REFERENCES `profile` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mention_mentioned` FOREIGN KEY (`mentioned_id`) REFERENCES `profile` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
