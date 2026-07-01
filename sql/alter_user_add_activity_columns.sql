-- user 테이블에 유입 채널 / 알림 설정 / 첫 활동 시각 / 온보딩 컬럼 추가.
-- 명세서(cozy_admin_spec_v3 v1.2) MBR-001~003 참고.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- 전제: alter_user_add_status_columns.sql이 먼저 적용되어 있어야 합니다.
--       (status / suspended_until / write_restricted_until / is_supporter 컬럼)
--
-- 컬럼 설명:
--   utm_source / utm_medium — 가입 유입 채널. 앱 최초 실행 시 파라미터로 수신하면 저장.
--     NULL이면 직접 유입 또는 미수집.
--   push_enabled — 기기 푸시 알림 동의 여부. 앱에서 설정 변경 시 업데이트.
--   first_post_at — 최초 게시글(talk/think) 작성 시각. NULL이면 아직 작성 없음.
--     삭제된 게시글도 content_event_log에 기록되므로, 실제 집계는 그쪽을 우선.
--     이 컬럼은 어드민 목록/상세 화면 빠른 조회용 캐시값임.
--   first_reaction_at — 최초 반응(좋아요/북마크) 시각. 마찬가지로 캐시값.
--   onboarding_started — 온보딩 시작 시각. NULL이면 미시작.
--   onboarding_completed — 온보딩 완료 시각. NULL이면 미완료.
--   onboarding_drop_step — 온보딩 이탈 단계 번호. NULL이면 이탈 없음(완료 또는 미시작).
--
-- 보안 주의: utm_source/utm_medium은 외부 파라미터 수신값이므로 저장 전 반드시 서버에서 길이 제한 및
--   허용값 검증 후 저장할 것 (클라이언트 입력값 그대로 DB에 넣지 않도록 주의).

ALTER TABLE `user`
    ADD COLUMN `utm_source` VARCHAR(100) NULL
        COMMENT '가입 유입 채널 (예: kakao_ad, instagram). 외부 파라미터 수신값 — 저장 전 서버 검증 필수'
        AFTER `is_supporter`,
    ADD COLUMN `utm_medium` VARCHAR(100) NULL
        COMMENT '유입 매체 (예: cpc, organic). 외부 파라미터 수신값 — 저장 전 서버 검증 필수'
        AFTER `utm_source`,
    ADD COLUMN `push_enabled` TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '기기 푸시 알림 동의 여부. 앱에서 설정 변경 시 업데이트'
        AFTER `utm_medium`,
    ADD COLUMN `first_post_at` DATETIME NULL
        COMMENT '최초 게시글 작성 시각. 어드민 목록/상세 화면용 캐시값 (정확한 집계는 content_event_log 참고)'
        AFTER `push_enabled`,
    ADD COLUMN `first_reaction_at` DATETIME NULL
        COMMENT '최초 반응(좋아요/북마크) 시각. 어드민 목록/상세 화면용 캐시값'
        AFTER `first_post_at`,
    ADD COLUMN `onboarding_started` DATETIME NULL
        COMMENT '온보딩 시작 시각. NULL이면 미시작'
        AFTER `first_reaction_at`,
    ADD COLUMN `onboarding_completed` DATETIME NULL
        COMMENT '온보딩 완료 시각. NULL이면 미완료'
        AFTER `onboarding_started`,
    ADD COLUMN `onboarding_drop_step` INT NULL
        COMMENT '온보딩 이탈 단계 번호. NULL이면 이탈 없음 (완료 또는 미시작)'
        AFTER `onboarding_completed`;
