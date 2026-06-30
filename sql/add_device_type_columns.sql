-- 노션 스펙(데이터 수집 가능 여부 문서)이 요구하는 device_type 컬럼을
-- 기존 login_log / app_launch_event 테이블에 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- NULL 허용으로 두는 이유: 프론트엔드가 아직 device_type 값을 보내지 않는 동안에는
-- 비워둔 채로 계속 기록이 들어가야 하므로(필수값으로 막으면 기존 호출이 전부 실패함).
-- 프론트 협조가 끝나기 전까지는 NULL로 쌓이는 게 정상.
-- 보안 주의: 기기 식별자(예: IMEI, advertising id)는 절대 저장하지 않음. iOS/Android 구분값만 저장.

ALTER TABLE `login_log`
    ADD COLUMN `device_type` ENUM('ios', 'android') NULL AFTER `platform`;

ALTER TABLE `app_launch_event`
    ADD COLUMN `device_type` ENUM('ios', 'android') NULL AFTER `user_id`;
