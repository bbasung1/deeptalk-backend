-- 앱 실행(포그라운드 진입) 이벤트 수집용 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- login_log와의 차이: login_log는 oauth 재로그인/자체 JWT 갱신 시에만 기록되고,
-- 토큰이 아직 유효한 채로 앱을 다시 열었을 때(백그라운드 -> 포그라운드)는 잡히지 않음.
-- "앱 실행 횟수"는 그 경우까지 포함해야 하므로 프론트에서 별도로 이벤트를 보내야 함.
--
-- 보안 주의: user_id/시각만 기록 (개인정보·기기정보 없음).

CREATE TABLE `app_launch_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT 'user.id',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_created` (`user_id`, `created_at`),
    CONSTRAINT `fk_app_launch_event_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
