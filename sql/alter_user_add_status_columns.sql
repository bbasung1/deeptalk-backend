-- 유저 계정 상태 및 제재 컬럼 추가. 어드민 명세서(cozy_admin_spec_v3.docx v1.2) 요구사항.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- status: 계정 상태. 기본값 'normal'. 어드민이 직접 변경하거나 suspend/ban 처리 시 업데이트.
-- suspended_until: NULL이면 정상 상태. 값이 있으면 해당 시각까지 계정 일시정지.
--   만료 후 자동 해제는 애플리케이션 레벨에서 처리 (로그인/API 진입 시 현재 시각과 비교).
-- write_restricted_until: NULL이면 정상 상태. 값이 있으면 해당 시각까지 글쓰기 제한.
--   기간 만료 시 자동 해제 (suspended_until과 동일한 방식).
-- is_supporter: 텀블벅 서포터 여부. 어드민이 직접 수동 설정 또는 배치 처리로 관리.
--
-- 보안 주의:
--   - suspended_until/write_restricted_until 값을 신뢰하는 쪽은 서버이어야 함.
--     클라이언트가 이 값을 받아도 제재 판정은 반드시 서버에서 재확인할 것.
--   - status 변경 이력은 admin_audit_logs에 기록해야 함 (logAdminAction 활용).

ALTER TABLE `user`
    ADD COLUMN `status` ENUM('normal', 'warned', 'suspended', 'banned') NOT NULL DEFAULT 'normal'
        COMMENT '계정 상태. 어드민이 변경하거나 제재 처리 시 업데이트됨'
        AFTER `deletetime`,
    ADD COLUMN `suspended_until` DATETIME NULL
        COMMENT '일시정지 해제 일시. NULL이면 정상 상태. 만료 후 자동 해제는 앱 레벨에서 처리'
        AFTER `status`,
    ADD COLUMN `write_restricted_until` DATETIME NULL
        COMMENT '글쓰기 제한 해제 일시. NULL이면 정상 상태. 기간 만료 시 자동 해제'
        AFTER `suspended_until`,
    ADD COLUMN `is_supporter` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '텀블벅 서포터 여부. 어드민이 수동 설정 또는 배치 처리'
        AFTER `write_restricted_until`;

-- 어드민 화면에서 status별 필터링 조회 시 사용되는 인덱스.
CREATE INDEX `idx_user_status` ON `user` (`status`);
