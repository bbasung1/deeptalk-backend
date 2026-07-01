-- report.status enum 정리: dismissed 제거 + 명세서(cozy_admin_spec_v3 v1.2) 신규 상태값 추가.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 배경: report_actions.action_type에 이미 'dismissed'가 있어(add_report_actions_table.sql),
-- report.status의 'dismissed'는 같은 정보의 중복 저장이었음.
-- 정리 방향: report.status는 "어디까지 처리됐나" 라이프사이클만 담당하고,
-- "어떻게 처리됐나(기각/경고/삭제 등)"는 report_actions.action_type이 담당.
-- 명세서의 새 8개 상태값에 dismissed가 없는 것도 이 방향과 일치.
--
-- 주의: MySQL은 ENUM에서 값을 제거해도 에러 없이 통과하지만, 제거된 값을 갖고 있던 기존 행은
-- 경고 없이 빈 문자열('')로 바뀝니다. 반드시 아래 1번 UPDATE를 ALTER 전에 실행하세요.
--
-- 함께 배포 필요: admin.js의 REPORT_ACTION_TO_STATUS에서 dismissed: "dismissed" -> "resolved" 변경.

-- 1) 기존 status='dismissed' 행을 'resolved'로 이전.
--    "기각됨"이라는 정보 자체는 report_actions.action_type='dismissed'에 이미 보존되어 있으므로 손실 없음.
UPDATE `report` SET `status` = 'resolved' WHERE `status` = 'dismissed';

-- 2) enum 교체: dismissed 제거, 명세서 v1.2 신규 값 추가.
ALTER TABLE `report`
    MODIFY COLUMN `status` ENUM(
        'pending',
        'ai_analyzing',
        'ai_done',
        'ai_failed',
        'reviewing',
        'resolved',
        'appealed',
        'appeal_resolved'
    ) NOT NULL DEFAULT 'pending';
