-- talk / think / comment 테이블에 visibility_status 컬럼 추가.
-- 명세서(cozy_admin_spec_v3 v1.2) PST-002 / RPT-003 참고.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 역할 분리:
--   deleted_at  → "언제 소프트 삭제됐나" 시각 기록 (기존 컬럼, 변경 없음)
--   visibility_status → "현재 화면 노출 상태가 무엇인가" (신규, 어드민 화면 표시/제어용)
--
-- 기존 데이터 처리 기준:
--   deleted_at IS NOT NULL  → 작성자가 삭제한 것이므로 'deleted_by_user'
--   deleted_at IS NULL      → 정상 노출 상태이므로 'visible'
-- (관리자 삭제/숨김 이력은 이 시점 이전 데이터에 존재하지 않으므로 'deleted_by_admin',
--  'hidden_by_admin' 초기화는 하지 않음.)

-- ── talk ──────────────────────────────────────────────────────────────────
ALTER TABLE `talk`
    ADD COLUMN `visibility_status` ENUM(
        'visible',
        'hidden_by_admin',
        'deleted_by_user',
        'deleted_by_admin'
    ) NOT NULL DEFAULT 'visible'
    COMMENT '콘텐츠 노출 상태. 어드민 액션 및 작성자 삭제 시 업데이트.'
    AFTER `deleted_at`;

UPDATE `talk` SET `visibility_status` = 'deleted_by_user' WHERE `deleted_at` IS NOT NULL;

-- ── think ─────────────────────────────────────────────────────────────────
ALTER TABLE `think`
    ADD COLUMN `visibility_status` ENUM(
        'visible',
        'hidden_by_admin',
        'deleted_by_user',
        'deleted_by_admin'
    ) NOT NULL DEFAULT 'visible'
    COMMENT '콘텐츠 노출 상태. 어드민 액션 및 작성자 삭제 시 업데이트.'
    AFTER `deleted_at`;

UPDATE `think` SET `visibility_status` = 'deleted_by_user' WHERE `deleted_at` IS NOT NULL;

-- ── comment ───────────────────────────────────────────────────────────────
ALTER TABLE `comment`
    ADD COLUMN `visibility_status` ENUM(
        'visible',
        'hidden_by_admin',
        'deleted_by_user',
        'deleted_by_admin'
    ) NOT NULL DEFAULT 'visible'
    COMMENT '콘텐츠 노출 상태. 어드민 액션 및 작성자 삭제 시 업데이트.'
    AFTER `deleted_at`;

UPDATE `comment` SET `visibility_status` = 'deleted_by_user' WHERE `deleted_at` IS NOT NULL;
