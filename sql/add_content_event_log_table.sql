-- 첫 글/첫 반응 시각 등 콘텐츠 활동 시각 집계를 위한 테이블 추가.
-- talk/think/comment/post_like는 모두 하드 삭제(.del())되므로, 삭제 후에도
-- "첫 활동 시각"을 알아낼 수 있도록 별도의 append-only 로그 테이블로 기록함.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
-- 보안 주의: 게시물 본문/내용은 저장하지 않음. user_id/이벤트 종류/시각만 기록.

CREATE TABLE `content_event_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT 'user.id',
    `event_type` VARCHAR(20) NOT NULL COMMENT 'post_talk | post_think | comment | like',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_event_created` (`user_id`, `event_type`, `created_at`),
    CONSTRAINT `fk_content_event_log_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
