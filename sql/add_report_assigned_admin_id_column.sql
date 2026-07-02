-- 신고 처리 동시 진행 방지 잠금 컬럼 (RPT-010).
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- [처리하기] 클릭(POST /admin/api/reports/:id/claim) 시 이 컬럼에 담당 운영팀 ID를 채운다.
-- 다른 운영팀이 같은 신고를 처리하려 하면 이 값을 보고 막는다(utils/reportActions.js의 applyReportAction).
-- NULL이면 아직 아무도 처리 중이 아님. [반려] 처리 시에는 다시 NULL로 풀어서 다른 운영팀이 재처리할 수 있게 한다.

ALTER TABLE `report`
    ADD COLUMN `assigned_admin_id` INT UNSIGNED NULL COMMENT '처리 중인 담당 운영팀 admins.id. NULL이면 미배정' AFTER `resolution_type`,
    ADD CONSTRAINT `fk_report_assigned_admin` FOREIGN KEY (`assigned_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL;
