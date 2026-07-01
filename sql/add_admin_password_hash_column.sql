-- 개별 관리자 로그인(SYS-001) 도입을 위한 비밀번호 해시 컬럼.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- add_admins_table.sql 작성 당시에는 "비밀번호를 이 테이블에 저장하지 말 것"이라고
-- 되어 있었는데, 그건 평문 저장을 경고한 것이고 이제 bcrypt 해시(항상 60자)를 저장한다.
-- NULL 허용으로 둔 이유: 기존에 있던 admins 행(신원 기록용으로만 쓰이던 행)은
-- 비밀번호가 없으므로, 배포 후 각 관리자에게 임시 비밀번호를 발급해 채워야 함.
-- password_hash가 NULL인 계정은 로그인 자체가 불가능하도록 admin.js에서 처리함.

ALTER TABLE `admins`
    ADD COLUMN `password_hash` CHAR(60) NULL COMMENT 'bcrypt 해시. NULL이면 로그인 불가(임시 비밀번호 발급 전)' AFTER `email`;
