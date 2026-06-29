-- [AI 신고처리 기능 토대 6순위] 신고자 피드백/피제재자 제재 안내를 admin_message, push_notifications와
-- 연결하기 위한 컬럼 추가. 안내 문구/제재 버튼 자체는 정책 미확정이라 다루지 않고, 연결 구조만 준비.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 실행 전 확인 필요: report.report_id 의 실제 컬럼 타입을 `DESCRIBE report;`로 확인하세요.

ALTER TABLE `admin_message`
    ADD COLUMN `report_id` INT UNSIGNED NULL COMMENT 'report.report_id (신고자 피드백 발송 시 연결)' AFTER `user_id`,
    ADD COLUMN `moderation_case_id` BIGINT UNSIGNED NULL COMMENT 'moderation_cases.id (제재 안내 발송 시 연결)' AFTER `report_id`,
    ADD COLUMN `message_type` VARCHAR(30) NULL COMMENT '예: report_feedback, sanction_notice, general' AFTER `body`,
    ADD COLUMN `recipient_role` ENUM('reporter', 'sanctioned_user', 'general') NULL COMMENT '메시지 수신자가 신고자/피제재자/일반 공지 중 어느 쪽인지' AFTER `message_type`;

ALTER TABLE `admin_message`
    ADD KEY `idx_report_id` (`report_id`),
    ADD KEY `idx_moderation_case_id` (`moderation_case_id`),
    ADD CONSTRAINT `fk_admin_message_report` FOREIGN KEY (`report_id`) REFERENCES `report` (`report_id`) ON DELETE SET NULL,
    ADD CONSTRAINT `fk_admin_message_case` FOREIGN KEY (`moderation_case_id`) REFERENCES `moderation_cases` (`id`) ON DELETE SET NULL;

-- push_notifications는 발송 이력 로그라 admin_message.id로 연결하면 어떤 안내 메시지에 대한
-- 푸시였는지 추적 가능 (add_push_notifications_table.sql 참고 — fcm 토큰 값 자체는 저장 안 함).
ALTER TABLE `push_notifications`
    ADD COLUMN `message_id` BIGINT UNSIGNED NULL COMMENT 'admin_message.id (어떤 안내 메시지의 푸시인지)' AFTER `notification_type`,
    ADD KEY `idx_message_id` (`message_id`),
    ADD CONSTRAINT `fk_push_notifications_message` FOREIGN KEY (`message_id`) REFERENCES `admin_message` (`id`) ON DELETE SET NULL;
