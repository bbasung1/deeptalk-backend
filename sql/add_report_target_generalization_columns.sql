-- [AI 신고처리 기능 토대 2순위] report 테이블이 게시글(type/post_id) 중심으로 되어있는 것을
-- 게시글/댓글/인용/계정 신고를 모두 표현할 수 있는 target_type/target_subtype/target_id로 일반화.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 실행 전 확인 필요 (2026-06-29 실제 DB 확인 결과로 아래 내용 수정함):
--   실제 report 테이블에는 `type` 컬럼이 없고, report.js가 그대로 쓰는 `post_type`
--   ENUM('think','talk','comment','user')이 이미 있습니다. 따라서 별도 숫자 매핑(0/1/2) 없이
--   `post_type` 값을 그대로 백필 기준으로 사용합니다.
--
-- 기존 `post_type`/`post_id` 컬럼은 바로 삭제하지 않습니다. admin.js가 아직 이 컬럼들을 직접
-- 읽고 있고(신고 명단 페이지), CLAUDE.md 지침상 admin.js는 곧 개편될 예정이라 지금 같이
-- 손대지 않는 게 안전합니다. admin.js 개편 시 target_type/target_subtype/target_id 기준으로
-- 전환하면서 기존 컬럼을 정리하면 됩니다.

ALTER TABLE `report`
    ADD COLUMN `target_type` ENUM('content', 'account') NULL AFTER `post_type`,
    ADD COLUMN `target_subtype` ENUM('talk', 'think', 'comment', 'quote', 'user_account', 'profile', 'bot_suspected', 'impersonation') NULL AFTER `target_type`,
    ADD COLUMN `target_id` INT UNSIGNED NULL COMMENT '대상 PK (talk_num/think_num/comment_num/profile.id 등)' AFTER `target_subtype`;

-- 백필: 기존 post_type + post_id -> target_type/target_subtype/target_id.
-- post_type='user'인 신고는 계정 신고이므로 target_type='account'/target_subtype='user_account'로 매핑.
UPDATE `report`
SET
    `target_type` = CASE `post_type`
        WHEN 'user' THEN 'account'
        WHEN 'talk' THEN 'content'
        WHEN 'think' THEN 'content'
        WHEN 'comment' THEN 'content'
        ELSE NULL
    END,
    `target_subtype` = CASE `post_type`
        WHEN 'user' THEN 'user_account'
        WHEN 'talk' THEN 'talk'
        WHEN 'think' THEN 'think'
        WHEN 'comment' THEN 'comment'
        ELSE NULL
    END,
    `target_id` = `post_id`
WHERE `target_type` IS NULL AND `post_type` IS NOT NULL;

-- moderation_cases 쪽 병합 조회(같은 대상의 열려있는 case 찾기)와 짝이 되는 인덱스.
CREATE INDEX `idx_report_target` ON `report` (`target_type`, `target_subtype`, `target_id`);
