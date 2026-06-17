-- 사용자가 자신의 팔로우/팔로워 목록(및 개수)을 다른 사람에게 비공개로
-- 설정할 수 있게 하기 위한 컬럼 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.

ALTER TABLE `profile`
    ADD COLUMN `hide_follow_list` TINYINT(1) NOT NULL DEFAULT 0 AFTER `theme`;
