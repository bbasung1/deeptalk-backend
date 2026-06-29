-- [AI 신고처리 기능 토대 4순위] AI 분석 결과 저장 테이블 (MVP: report_ai_reviews만 우선 생성).
-- AI 모델/프롬프트가 바뀌어도 결과를 저장하는 구조 자체는 유지되도록 설계.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 주의: severity_level / risk_level은 제재 수위 정책이 회의 전이라 enum으로 고정하지 않고
-- 0~4 임시 정수값으로만 둡니다. 정책 확정 후 enum 또는 별도 lookup 테이블로 전환 검토.
--
-- 보안 주의:
--   - triage_result_json / analysis_result_json에는 신고된 콘텐츠 일부가 인용될 수 있습니다.
--     report_evidence_snapshots와 동일하게 관리자 권한으로만 조회되도록 API를 제한하세요.
--   - 이 테이블에 AI API 키나 호출 원본 요청/응답 헤더 등 인증정보를 저장하지 마세요
--     (.env로만 관리, CLAUDE.md 지침 참고).

CREATE TABLE `report_ai_reviews` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `moderation_case_id` BIGINT UNSIGNED NOT NULL COMMENT 'moderation_cases.id',
    `policy_version` VARCHAR(20) NOT NULL COMMENT '분석 시점 정책 버전 식별자',
    `prompt_version` VARCHAR(20) NOT NULL COMMENT '분석 시점 프롬프트 버전 식별자',
    `triage_result_json` JSON NULL COMMENT '1차 분류 결과',
    `analysis_result_json` JSON NULL COMMENT '상세 분석 결과',
    `risk_level` TINYINT UNSIGNED NULL COMMENT '0~4 임시값, enum 미확정',
    `case_family` VARCHAR(50) NULL,
    `primary_case_type` VARCHAR(50) NULL,
    `recommended_queue` VARCHAR(50) NULL,
    `recommended_action` VARCHAR(50) NULL,
    `severity_level` TINYINT UNSIGNED NULL COMMENT '0~4 임시값, enum 미확정 (정책 회의 전)',
    `confidence` DECIMAL(4,3) NULL COMMENT '0.000~1.000',
    `context_expansion_needed` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_moderation_case_id` (`moderation_case_id`),
    CONSTRAINT `fk_rar_case` FOREIGN KEY (`moderation_case_id`) REFERENCES `moderation_cases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 아래는 추후(정책/프롬프트 확정 후) 필요해지는 후속 테이블 초안입니다. 지금은 생성하지 않고
-- 참고용으로만 남겨둡니다 — 필드/관계가 바뀔 가능성이 높아 MVP 범위에서 제외했습니다.
--
-- CREATE TABLE `report_ai_context_expansions` (
--     `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
--     `report_ai_review_id` BIGINT UNSIGNED NOT NULL COMMENT 'report_ai_reviews.id',
--     `expanded_context_json` JSON NULL,
--     `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--
-- CREATE TABLE `report_ai_notice_drafts` (
--     `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
--     `moderation_case_id` BIGINT UNSIGNED NOT NULL,
--     `recipient_role` ENUM('reporter', 'sanctioned_user') NOT NULL,
--     `draft_text` TEXT NULL,
--     `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--
-- CREATE TABLE `report_ai_appeal_reviews` (
--     `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
--     `moderation_case_id` BIGINT UNSIGNED NOT NULL,
--     `appeal_result_json` JSON NULL,
--     `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
