-- 개별 관리자 로그인(SYS-001)의 JWT 세션을 폐기(로그아웃) 가능하게 하기 위한 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 명세서 SYS-001은 "자동 로그아웃 없음(운영 편의)"을 요구한다. 즉 로그인 JWT에
-- exp를 넣지 않는다. 그런데 순수 stateless JWT는 만료가 없으면 로그아웃 시
-- 무효화할 방법이 없으므로, 발급한 세션(jti)을 이 테이블에 기록해두고
-- 로그인 유지 중에는 매 요청마다 이 테이블도 함께 확인한다(로그아웃 시 revoked_at 기록).
-- users 앱의 sessions 테이블(체류시간 통계용, user.id 기준)과는 목적이 다른 별개 테이블이다.

CREATE TABLE `admin_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'JWT의 jti로 사용',
    `admin_id` INT UNSIGNED NOT NULL COMMENT 'admins.id',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `revoked_at` DATETIME NULL COMMENT 'NULL이면 아직 유효한 세션. 로그아웃 시 채움.',
    PRIMARY KEY (`id`),
    KEY `idx_admin_id` (`admin_id`),
    CONSTRAINT `fk_admin_sessions_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
