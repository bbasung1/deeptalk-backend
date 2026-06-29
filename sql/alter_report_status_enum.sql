-- report.decision (자유 입력 컬럼으로 추정) -> report.status ENUM 으로 교체.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 절차:
-- 1) 새 컬럼 추가
-- 2) 기존 decision 값 -> status 값으로 이전 (값 매핑은 실제 운영 중 입력된 값을 확인 후 조정해주세요.
--    아래 매핑은 코드상 decision에 값을 써넣는 곳이 없어 비어있을 가능성이 높다는 가정 하에 작성함.
--    실행 전 `SELECT DISTINCT decision FROM report;`로 실제 값을 확인하세요.)
-- 3) 기존 decision 컬럼 삭제

ALTER TABLE `report`
    ADD COLUMN `status` ENUM('pending', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending' AFTER `decision`;

-- 기존 decision 값이 있다면 여기서 보존 매핑 (예시 — 실제 값 확인 후 필요시 수정).
-- UPDATE `report` SET `status` = 'resolved' WHERE `decision` IS NOT NULL AND `decision` <> '';

ALTER TABLE `report`
    DROP COLUMN `decision`;
