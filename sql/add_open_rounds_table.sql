-- 퍼널 분석용: "기수(회차)" 단위로 가입자를 그룹핑하기 위한 테이블 + users.open_round 컬럼.
-- 이 프로젝트는 knex 마이그레이션 파일을 사용하지 않으므로 DB에 직접 실행해주세요.
--
-- open_rounds: 회차 자체의 메타데이터(회차 번호, 시작/종료 시각, 설명)만 관리.
-- user.open_round: 가입 당시 어떤 회차였는지 기록 (가입 이후 값이 바뀌지 않음).

CREATE TABLE `open_rounds` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `round_number` INT UNSIGNED NOT NULL COMMENT '몇 기수인지 (1, 2, 3 ...)',
    `title` VARCHAR(100) NULL COMMENT '회차 이름 (예: "1기 베타")',
    `opened_at` DATETIME NOT NULL COMMENT '모집/오픈 시작 시각',
    `closed_at` DATETIME NULL COMMENT '모집 종료 시각 (진행 중이면 NULL)',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_round_number` (`round_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- user 테이블에 가입 당시 회차 기록 컬럼 추가.
-- FK를 걸지 않은 이유: 과거 가입자는 open_rounds 데이터가 소급 생성되지 않을 수 있어
-- NULL을 허용해야 하고, 운영 편의상 회차 데이터 정리 시 가입자 row에 영향이 없도록 함.
ALTER TABLE `user`
    ADD COLUMN `open_round` INT UNSIGNED NULL COMMENT '가입 당시 회차 (open_rounds.round_number)' AFTER `created_at`;
