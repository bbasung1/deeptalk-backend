-- [AI 신고처리 기능 토대 6순위] 신고자 피드백/피제재자 제재 안내를 admin_messages, push_notifications와
-- 연결하기 위한 컬럼 추가. 안내 문구/제재 버튼 자체는 정책 미확정이라 다루지 않고, 연결 구조만 준비.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 2026-06-29 실제 DB 확인 결과로 수정함:
--   - 실제 테이블명은 `admin_message`(단수)가 아니라 `admin_messages`(복수)이고, `user_id`/`body`
--     컬럼은 없습니다 (실제: id, admin_id, title, content, target_type, target_user_id, sent_at).
--     참고: admin_message.js/admin.js 코드가 여전히 단수 `admin_message`를 쿼리하고 있는데,
--     이는 이 작업 범위 밖의 기존 불일치로 보입니다 — 여기서는 건드리지 않습니다.
--   - admin_messages.target_type(enum 'all','individual')은 이미 있는 컬럼이라 이름이 겹칩니다.
--     혼동 방지를 위해 신고 연결용 분류 컬럼은 `message_type`/`recipient_role`만 추가하고
--     기존 target_type은 그대로 둡니다.

ALTER TABLE `admin_messages`
    ADD COLUMN `report_id` INT UNSIGNED NULL COMMENT 'report.report_id (신고자 피드백 발송 시 연결)' AFTER `admin_id`,
    ADD COLUMN `moderation_case_id` BIGINT UNSIGNED NULL COMMENT 'moderation_cases.id (제재 안내 발송 시 연결)' AFTER `report_id`,
    ADD COLUMN `message_type` VARCHAR(30) NULL COMMENT '예: report_feedback, sanction_notice, general' AFTER `content`,
    ADD COLUMN `recipient_role` ENUM('reporter', 'sanctioned_user', 'general') NULL COMMENT '메시지 수신자가 신고자/피제재자/일반 공지 중 어느 쪽인지' AFTER `message_type`;

ALTER TABLE `admin_messages`
    ADD KEY `idx_report_id` (`report_id`),
    ADD KEY `idx_moderation_case_id` (`moderation_case_id`),
    ADD CONSTRAINT `fk_admin_messages_report` FOREIGN KEY (`report_id`) REFERENCES `report` (`report_id`) ON DELETE SET NULL,
    ADD CONSTRAINT `fk_admin_messages_case` FOREIGN KEY (`moderation_case_id`) REFERENCES `moderation_cases` (`id`) ON DELETE SET NULL;

-- push_notifications는 발송 이력 로그라 admin_messages.id로 연결하면 어떤 안내 메시지에 대한
-- 푸시였는지 추적 가능 (add_push_notifications_table.sql 참고 — fcm 토큰 값 자체는 저장 안 함).
-- 주의: admin_messages.id가 BIGINT UNSIGNED가 아니라 BIGINT(signed)라서 FK 타입을 맞춰야 합니다
-- (errno 150 방지 — UNSIGNED로 두면 FK 생성이 실패합니다. 2026-06-29 실제 DB 확인).
ALTER TABLE `push_notifications`
    ADD COLUMN `message_id` BIGINT NULL COMMENT 'admin_messages.id (어떤 안내 메시지의 푸시인지)' AFTER `notification_type`,
    ADD KEY `idx_message_id` (`message_id`),
    ADD CONSTRAINT `fk_push_notifications_message` FOREIGN KEY (`message_id`) REFERENCES `admin_messages` (`id`) ON DELETE SET NULL;
