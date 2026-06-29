-- [AI 신고처리 기능 토대 1순위] reports(개별 신고)와 moderation_cases(어드민 처리 단위) 분리.
-- 동일 신고 대상에 대한 미처리(reports) 건들을 하나의 case로 묶어서 처리하기 위한 구조.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 실행 전 확인 필요: report.report_id 의 실제 컬럼 타입을 `DESCRIBE report;`로 확인하고
-- 아래 report_id 컬럼 타입을 그대로 맞춰주세요. FK 타입이 다르면 errno 150으로 실패합니다.
--
-- 정책(제재 수위, 판단 기준)은 아직 미확정이라 이 테이블에는 넣지 않았습니다.
-- "같은 target_type + target_subtype + target_id 기준으로 미처리 신고를 병합" 로직과
-- "resolved/dismissed 상태 case에는 새 신고를 병합하지 않고 새 case를 생성" 규칙은
-- 애플리케이션 레벨에서 구현 (DB 제약으로는 강제하지 않음 — 과거 종료된 case 기록은
-- 그대로 보존되어야 하므로 status를 비워두는 방식보다 새 case 생성이 맞음).
--
-- target_type/target_subtype은 add_report_target_generalization_columns.sql 과 동일한
-- 값 집합을 사용합니다 (둘이 어긋나면 병합 로직이 깨지니 함께 수정해주세요).

CREATE TABLE `moderation_cases` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `target_type` ENUM('content', 'account') NOT NULL,
    `target_subtype` ENUM('talk', 'think', 'comment', 'quote', 'user_account', 'profile', 'bot_suspected', 'impersonation') NULL,
    `target_id` INT UNSIGNED NULL COMMENT '대상 PK (talk_num/think_num/comment_num/profile.id 등 — 실제 컬럼 타입과 다르면 조정 필요)',
    `status` ENUM('pending', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
    `admin_id` INT UNSIGNED NULL COMMENT 'admins.id (개별 관리자 로그인 도입 전까지는 NULL 가능, add_admins_table.sql 참고)',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `resolved_at` DATETIME NULL,
    PRIMARY KEY (`id`),
    KEY `idx_target_open_case` (`target_type`, `target_subtype`, `target_id`, `status`) COMMENT '미처리 신고 병합 시 "같은 대상의 열려있는 case 찾기" 조회용',
    CONSTRAINT `fk_moderation_cases_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 개별 신고(report)를 case에 매핑. 한 신고는 하나의 case에만 속하도록 report_id를 UNIQUE로 둠.
CREATE TABLE `moderation_case_reports` (
    `moderation_case_id` BIGINT UNSIGNED NOT NULL,
    `report_id` INT UNSIGNED NOT NULL COMMENT 'report.report_id (실행 전 타입 확인 필요, 위 주석 참고)',
    `added_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`moderation_case_id`, `report_id`),
    UNIQUE KEY `uq_report_id` (`report_id`) COMMENT '신고 1건은 case 1개에만 속함',
    CONSTRAINT `fk_mcr_case` FOREIGN KEY (`moderation_case_id`) REFERENCES `moderation_cases` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mcr_report` FOREIGN KEY (`report_id`) REFERENCES `report` (`report_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
