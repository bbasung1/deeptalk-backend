-- 어드민 운영 데이터 수집을 위한 관리자 식별 테이블.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 주의: 현재 admin.js는 .env의 단일 공용 비밀번호로 로그인하는 구조라(개별 관리자 로그인 없음),
-- 이 테이블은 "누가 처리했는지"를 기록하기 위한 신원 정보만 담고 실제 로그인 인증에는
-- 아직 연결하지 않음. admin.js 개편 시 개별 관리자 로그인을 붙이면서 같이 연결할 것.
-- 보안 주의: 비밀번호를 이 테이블에 저장하지 말 것 (로그인 시스템 개편 시 별도 해시 컬럼/방식 설계 필요).

CREATE TABLE `admins` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
