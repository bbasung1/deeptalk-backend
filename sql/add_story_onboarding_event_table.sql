-- 스토리 온보딩 시작/완료/단계별 이탈 집계를 위한 테이블 추가.
-- 프론트엔드가 온보딩 진행 상황을 보낼 때마다 한 행씩 append-only로 기록함.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
-- 보안 주의: user_id/이벤트 종류/단계 번호/시각만 기록 (개인정보·본문 없음).

CREATE TABLE `story_onboarding_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT 'user.id',
    `event_type` VARCHAR(10) NOT NULL COMMENT 'start | step | complete | drop',
    `step` INT UNSIGNED NULL COMMENT 'event_type이 step/drop일 때의 단계 번호 (1부터 시작)',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_event_created` (`user_id`, `event_type`, `created_at`),
    CONSTRAINT `fk_story_onboarding_event_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
