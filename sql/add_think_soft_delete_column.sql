-- think 하드 삭제(.delete()) -> 소프트 삭제(deleted_at) 전환.
-- talk/comment/post_like/bookmark는 add_soft_delete_columns.sql에서 이미 전환했는데, think만
-- 같은 처리가 빠져 있어서 (스펙에 명시된 게 아니라 작업 범위를 좁게 잡은 판단 실수) 발생한
-- talk/think 동작 불일치를 바로잡기 위해 추가합니다.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 과거에 이미 하드 삭제된 think 데이터는 복구할 수 없고, 이 컬럼 추가가 그 데이터를
-- 되살리지 못합니다. 이 시점 이후의 삭제만 소프트 삭제로 보존됩니다.

ALTER TABLE `think`
    ADD COLUMN `deleted_at` DATETIME NULL COMMENT 'NULL이면 삭제되지 않음. 소프트 삭제 시각 기록.';

CREATE INDEX `idx_think_deleted_at` ON `think` (`deleted_at`);
