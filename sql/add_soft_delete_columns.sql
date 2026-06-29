-- talk / comment / post_like / bookmark 하드 삭제(.del()) -> 소프트 삭제(deleted_at) 전환.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 과거에 이미 하드 삭제된 데이터는 복구할 수 없고, 이 컬럼 추가가 그 데이터를 되살리지
-- 못합니다. 이 시점 이후의 삭제만 소프트 삭제로 보존됩니다.
--
-- like/bookmark(post_like/bookmark 테이블)는 "좋아요/북마크 취소" 자체도 소프트 삭제로
-- 전환합니다 — 취소 시점에도 deleted_at만 채우고 row는 남기며, 다시 좋아요/북마크 하면
-- 새 row를 추가합니다(누적 이력 보존, 분석 목적). 코드 쪽 dupcheck/toggle 로직은
-- like.js / bookmark.js에서 deleted_at IS NULL 기준으로만 "현재 활성" 여부를 판단하도록
-- 같이 수정했습니다.

ALTER TABLE `talk`
    ADD COLUMN `deleted_at` DATETIME NULL COMMENT 'NULL이면 삭제되지 않음. 소프트 삭제 시각 기록.';

ALTER TABLE `comment`
    ADD COLUMN `deleted_at` DATETIME NULL COMMENT 'NULL이면 삭제되지 않음. 소프트 삭제 시각 기록.';

ALTER TABLE `post_like`
    ADD COLUMN `deleted_at` DATETIME NULL COMMENT 'NULL이면 현재 활성(좋아요 중). 취소 시각 기록.';

ALTER TABLE `bookmark`
    ADD COLUMN `deleted_at` DATETIME NULL COMMENT 'NULL이면 현재 활성(북마크 중). 취소 시각 기록.';

-- 조회 성능을 위해 deleted_at을 포함한 인덱스 추가 (기존 인덱스 유무는 프로젝트에 맞게 조정).
CREATE INDEX `idx_talk_deleted_at` ON `talk` (`deleted_at`);
CREATE INDEX `idx_comment_deleted_at` ON `comment` (`deleted_at`);
CREATE INDEX `idx_post_like_deleted_at` ON `post_like` (`deleted_at`);
CREATE INDEX `idx_bookmark_deleted_at` ON `bookmark` (`deleted_at`);
