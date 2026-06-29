-- [AI 신고처리 기능 토대 2순위] report 테이블이 게시글(type/post_id) 중심으로 되어있는 것을
-- 게시글/댓글/인용/계정 신고를 모두 표현할 수 있는 target_type/target_subtype/target_id로 일반화.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- ⚠️ 실행 전 확인 필요:
--   1) `DESCRIBE report;`로 기존 `type`, `post_id` 컬럼의 실제 타입을 확인하세요.
--   2) `SELECT DISTINCT type FROM report;`로 실제 들어있는 값을 확인 후 아래 백필 매핑을
--      필요시 조정하세요 (admin.js 기준 type은 0:talk, 1:think, 2:comment로 추정 — mention 테이블의
--      post_type과 동일한 규칙이라고 가정).
--
-- 기존 `type`/`post_id` 컬럼은 바로 삭제하지 않습니다. admin.js가 아직 이 컬럼들을 직접
-- 읽고 있고(신고 명단 페이지), CLAUDE.md 지침상 admin.js는 곧 개편될 예정이라 지금 같이
-- 손대지 않는 게 안전합니다. admin.js 개편 시 target_type/target_subtype/target_id 기준으로
-- 전환하면서 기존 컬럼을 정리하면 됩니다.

ALTER TABLE `report`
    ADD COLUMN `target_type` ENUM('content', 'account') NULL AFTER `type`,
    ADD COLUMN `target_subtype` ENUM('talk', 'think', 'comment', 'quote', 'user_account', 'profile', 'bot_suspected', 'impersonation') NULL AFTER `target_type`,
    ADD COLUMN `target_id` INT UNSIGNED NULL COMMENT '대상 PK (talk_num/think_num/comment_num/profile.id 등)' AFTER `target_subtype`;

-- 백필: 기존 type(0:talk, 1:think, 2:comment) + post_id -> target_type/target_subtype/target_id.
-- 실제 type 값 분포를 확인한 뒤 필요시 WHEN 절을 조정해주세요.
UPDATE `report`
SET
    `target_type` = 'content',
    `target_subtype` = CASE `type`
        WHEN 0 THEN 'talk'
        WHEN 1 THEN 'think'
        WHEN 2 THEN 'comment'
        ELSE NULL
    END,
    `target_id` = `post_id`
WHERE `target_type` IS NULL;

-- 계정/유저 신고(있다면)는 위 백필로 채워지지 않으므로, 실제 데이터 확인 후 별도 UPDATE 필요.
-- 예시 (실제 컬럼/값 확인 후 사용):
-- UPDATE `report` SET `target_type` = 'account', `target_subtype` = 'profile', `target_id` = `reported_id`
-- WHERE <계정 신고를 식별하는 조건>;

-- moderation_cases 쪽 병합 조회(같은 대상의 열려있는 case 찾기)와 짝이 되는 인덱스.
CREATE INDEX `idx_report_target` ON `report` (`target_type`, `target_subtype`, `target_id`);
