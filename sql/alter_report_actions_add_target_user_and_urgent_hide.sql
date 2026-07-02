-- report_actions 확장: (1) 긴급조치(urgent_hide) action_type 추가, (2) 멤버 상세 페이지에서
-- 신고 없이 직접 내리는 제재도 기록할 수 있도록 target_user_id 추가 + report_id를 NULL 허용으로 변경.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 배경: MBR-007(멤버 상세 — 제재 이력)은 "report_actions WHERE target_user_id"를 데이터 소스로 삼고 있는데
-- 기존 report_actions에는 target_user_id 컬럼이 없어서(report_id -> report.reported_id로 조인해야만 유저를
-- 찾을 수 있었음), MBR-008(멤버 상세에서 신고 없이 직접 제재)처럼 특정 report와 무관한 제재를 기록할 방법이
-- 없었다. target_user_id를 추가하고 report_id를 nullable로 바꿔서 두 경로를 하나의 테이블로 통합한다.
--
-- report_id가 있는 행(신고 처리로 발생한 제재): target_user_id도 report.reported_id와 동일하게 채운다
--   (조인 없이 바로 조회 가능하도록 의도적 비정규화 — MBR-007이 자주 쓰는 조회 패턴).
-- report_id가 NULL인 행(멤버 상세에서 직접 제재): target_user_id만 채운다.
--
-- urgent_hide: RPT-010 "긴급 조치" 버튼 — 콘텐츠만 즉시 hidden_by_admin 처리하고 신고 건 자체는
-- reviewing 상태를 유지한다(다른 action_type들과 달리 resolved로 전환하지 않음).

ALTER TABLE `report_actions`
    MODIFY COLUMN `report_id` INT UNSIGNED NULL COMMENT '신고 처리로 발생한 제재면 report.report_id. 멤버 상세에서 직접 내린 제재는 NULL',
    ADD COLUMN `target_user_id` INT UNSIGNED NULL COMMENT '제재 대상 user.id. report_id가 있으면 report.reported_id와 동일값(비정규화), 없으면 이 값만 있음' AFTER `admin_id`,
    ADD CONSTRAINT `fk_report_actions_target_user` FOREIGN KEY (`target_user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL,
    MODIFY COLUMN `action_type` ENUM(
        'notice',
        'warning',
        'write_restricted',
        'content_deleted',
        'account_suspended',
        'account_banned',
        'dismissed',
        'no_action',
        'urgent_hide'
    ) NOT NULL;

CREATE INDEX `idx_report_actions_target_user` ON `report_actions` (`target_user_id`);
