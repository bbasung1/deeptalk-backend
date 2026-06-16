-- 댓글 임시저장(이어쓰기) 기능을 위한 컬럼 추가
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.

ALTER TABLE `comment`
    ADD COLUMN `draft` TINYINT(1) NOT NULL DEFAULT 0 AFTER `reported`;

-- 내 임시저장 글/댓글 목록 조회(GET /write/drafts, GET /comment/drafts)를 빠르게 하기 위한 인덱스
ALTER TABLE `comment` ADD INDEX `idx_comment_user_draft` (`user_id`, `draft`);
ALTER TABLE `talk` ADD INDEX `idx_talk_writer_draft` (`writer_id`, `draft`);
ALTER TABLE `think` ADD INDEX `idx_think_writer_draft` (`writer_id`, `draft`);

-- ----------------------------------------------------------------------------
-- 보강: draft 컬럼이 NULL을 허용하지 않도록 강제 (NULL이면 draft==0/1 비교 둘 다
-- false가 되어 그 글/댓글이 어디에도 노출되지 않는 "유령 상태"가 될 수 있음).
-- talk/think는 이미 draft 컬럼이 존재했지만 INT(11) NULL DEFAULT 0 으로 되어 있었고,
-- 실제로 talk 테이블에 NULL 값이 있던 것이 2026-06-16 점검에서 확인됨.
-- comment는 새로 추가하므로 처음부터 NOT NULL이지만, 혹시 다른 경로로 이미
-- 컬럼이 생성돼 있었을 경우를 대비해 동일하게 한 번 더 정리한다.
-- ----------------------------------------------------------------------------
UPDATE `comment` SET `draft` = 0 WHERE `draft` IS NULL;
UPDATE `talk` SET `draft` = 0 WHERE `draft` IS NULL;
UPDATE `think` SET `draft` = 0 WHERE `draft` IS NULL;

ALTER TABLE `comment` MODIFY COLUMN `draft` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `talk` MODIFY COLUMN `draft` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `think` MODIFY COLUMN `draft` TINYINT(1) NOT NULL DEFAULT 0;
