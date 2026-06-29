-- DAU/MAU 등 리텐션 지표 계산의 기반이 되는 일별 접속 로그 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- login_log/app_launch_event와의 차이: 저 둘은 "재로그인/포그라운드 진입" 같은 특정 이벤트만
-- 잡고, 같은 토큰으로 계속 API를 호출하는 일반적인 사용은 안 잡힘. 이 테이블은 인증된 요청이
-- 들어올 때마다(general.js의 define_id에서 fire-and-forget으로) "그날 접속했는지"만 하루 1행으로
-- 기록해서 DAU/MAU 계산이 가능하게 함.
--
-- (user_id, access_date) UNIQUE로 묶어서 하루에 여러 번 호출해도 매번 insert가 일어나지 않고
-- INSERT IGNORE로 조용히 무시되게 함 (요청마다 DB 부하를 주지 않기 위함).
--
-- device_type을 채우지 않는 이유: define_id는 거의 모든 인증 라우트에서 공통으로 호출되는
-- 진입점인데, 여기까지 기기 정보를 넘기려면 수십 개 라우트의 호출 시그니처를 전부 바꿔야 해서
-- 위험 대비 효용이 낮음. 기기 정보가 필요한 지표는 login_log/app_launch_event/sessions
-- 쪽 값으로 충분히 커버됨.
-- 보안 주의: IP/유저에이전트 등 민감한 부가정보는 저장하지 않음.

CREATE TABLE `user_access_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT 'user.id',
    `accessed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '그날 첫 접속 시각',
    `access_date` DATE NOT NULL COMMENT '날짜별 집계용 (accessed_at의 날짜 부분)',
    `device_type` ENUM('ios', 'android') NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_user_access_date` (`user_id`, `access_date`),
    KEY `idx_access_date` (`access_date`),
    CONSTRAINT `fk_user_access_logs_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
