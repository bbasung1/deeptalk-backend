-- 게시물(talk/think) 작성자가 자신의 글에 달리는 반응(좋아요/댓글) 알림을
-- 게시물 단위로 뮤트할 수 있게 하기 위한 컬럼 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.

ALTER TABLE `talk`
    ADD COLUMN `notify_mute` TINYINT(1) NOT NULL DEFAULT 0 AFTER `draft`;
ALTER TABLE `think`
    ADD COLUMN `notify_mute` TINYINT(1) NOT NULL DEFAULT 0 AFTER `draft`;
