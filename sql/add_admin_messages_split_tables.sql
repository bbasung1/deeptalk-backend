-- 기존 admin_message 단일 테이블(수신자마다 한 행, is_read/read_at을 그 행에 같이 저장)을
-- 노션 스펙(데이터 수집 가능 여부 문서)이 요구하는 구조대로 admin_messages(발송 내용)와
-- admin_message_reads(유저별 읽음 기록)로 분리.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 기존 admin_message는 공지(target=all)도 발송 시점에 대상 유저마다 행을 미리 깔아두는
-- 방식이었음. 새 구조는 공지를 "한 행"(target_type=all)으로만 저장하고, 읽음은 실제로
-- 읽었을 때만 admin_message_reads에 행이 생기는 방식 — 대상자가 수만 명이어도 발송 시점에
-- insert가 늘어나지 않음.
--
-- admin_id를 NULL 허용으로 둔 이유: admin_audit_logs와 동일 — admin.js가 아직 개별 관리자
-- 로그인을 구현하지 않아 "어떤 관리자가 보냈는지" 식별할 방법이 없음 (admin.js 개편 후 채울 것).
--
-- 데이터 이전: 이 프로젝트는 아직 배포 전이라 admin_message에 쌓인 데이터는 전부 테스트
-- 데이터이므로, 새 테이블 생성 후 기존 admin_message 테이블은 그대로 DROP하면 됨.
-- (운영 데이터가 있는 상태라면 DROP 전에 admin_message -> admin_messages/admin_message_reads로
-- group_id 기준 마이그레이션 스크립트를 먼저 돌려야 함.)

CREATE TABLE `admin_messages` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `admin_id` INT UNSIGNED NULL COMMENT 'admins.id (개별 로그인 도입 전까지는 NULL 가능)',
    `title` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `target_type` ENUM('all', 'individual') NOT NULL,
    `target_user_id` INT UNSIGNED NULL COMMENT 'target_type=individual일 때만 채움 (user.id)',
    `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_sent_at` (`sent_at`),
    CONSTRAINT `fk_admin_messages_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_admin_messages_target_user` FOREIGN KEY (`target_user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_message_reads` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL COMMENT '읽은 유저 (user.id)',
    `message_id` BIGINT NOT NULL COMMENT 'admin_messages.id',
    `read_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_user_message` (`user_id`, `message_id`) COMMENT '같은 메시지를 중복으로 읽음 처리하지 않도록',
    KEY `idx_message_id` (`message_id`),
    CONSTRAINT `fk_admin_message_reads_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_admin_message_reads_message` FOREIGN KEY (`message_id`) REFERENCES `admin_messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기존 admin_message 테이블은 정리 완료 (2026-06-29, DROP TABLE 실행함).
