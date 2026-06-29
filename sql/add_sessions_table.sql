-- 실제 세션 시작/종료/체류시간을 기록하는 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 기존 admin.js의 "일별 세션 횟수" 페이지는 login_log 접속 간격(30분)을 기준으로
-- 세션을 근사 추정한 것이고, 이 테이블은 노션 스펙이 요구하는 "진짜 세션"(프론트가
-- 명시적으로 시작/종료를 알려주는 구조)임. 프론트가 /session 시작/종료 호출을 붙이기
-- 전까지는 이 테이블에 데이터가 쌓이지 않으므로, 기존 heuristic 페이지는 과거 데이터
-- 호환을 위해 그대로 유지함.
--
-- ended_at이 NULL이면 아직 종료되지 않은(또는 비정상 종료된) 세션.
-- duration_seconds는 종료 시점에 ended_at - started_at으로 계산해서 채움
-- (매번 계산하지 않고 저장해두면 통계 쿼리가 가벼워짐).

CREATE TABLE `sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT 'user.id',
    `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `ended_at` DATETIME NULL COMMENT 'NULL이면 아직 활성 세션(또는 비정상 종료)',
    `duration_seconds` INT UNSIGNED NULL COMMENT '종료 시점에 ended_at - started_at으로 계산해서 채움',
    `device_type` ENUM('ios', 'android') NULL,
    PRIMARY KEY (`id`),
    KEY `idx_user_started` (`user_id`, `started_at`),
    CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
