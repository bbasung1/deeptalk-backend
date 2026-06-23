-- 1순위: 코드 수정 없이 바로 집계 가능한 항목들.
-- 조회 전용 쿼리 모음 (테이블/컬럼 변경 없음). mysql 클라이언트에서 그대로 실행 가능.
-- 날짜 범위가 필요하면 각 쿼리의 WHERE 절에 created_at/report_time 조건을 추가해서 쓰면 됨.

-- ============================================
-- 1. 가입 완료 시각
-- ============================================
-- 유저별 가입 시각 (최근 가입자 위주)
SELECT id, email, created_at
FROM user
ORDER BY created_at DESC
LIMIT 50;

-- 일별 신규 가입자 수
SELECT DATE(created_at) AS signup_date, COUNT(*) AS signups
FROM user
GROUP BY DATE(created_at)
ORDER BY signup_date DESC;

-- ============================================
-- 2. 알림 설정 완료 여부 / 알림 설정자 수 (퍼널 데이터 항목과 겹침)
-- ============================================
-- 알림 종류별 설정자 수 (탈퇴 회원 제외)
-- servicealram/useralram/marketalram은 user가 아니라 profile 테이블 컬럼임 (profile.id = user.id)
SELECT
    SUM(IF(profile.servicealram = 1, 1, 0)) AS service_alarm_on,
    SUM(IF(profile.useralram   = 1, 1, 0)) AS activity_alarm_on,
    SUM(IF(profile.marketalram = 1, 1, 0)) AS marketing_alarm_on,
    COUNT(*) AS total_active_users
FROM user
JOIN profile ON profile.id = user.id
WHERE user.deletetime IS NULL;

-- ============================================
-- 3. 좋아요 · 북마크 수 (현재 상태 기준 — 하드 삭제된 건 제외됨)
-- ============================================
-- 전체 좋아요 수 (type: 0=talk, 1=think, 2=comment)
SELECT type, COUNT(*) AS like_count
FROM post_like
GROUP BY type;

-- 전체 북마크 수
SELECT type, COUNT(*) AS bookmark_count
FROM bookmark
GROUP BY type;

-- 유저별 좋아요 누른 횟수 Top 20
SELECT user_id, COUNT(*) AS like_given_count
FROM post_like
GROUP BY user_id
ORDER BY like_given_count DESC
LIMIT 20;

-- ============================================
-- 4. 차단 · 뮤트 사용 횟수 (현재 상태 기준)
-- ============================================
-- type: 0=block, 1=mute (general.js의 typeMap 기준)
SELECT
    SUM(IF(type = 0, 1, 0)) AS block_count,
    SUM(IF(type = 1, 1, 0)) AS mute_count
FROM block_list;

-- 유저별 차단/뮤트 건 수
SELECT user_id, type, COUNT(*) AS cnt
FROM block_list
GROUP BY user_id, type
ORDER BY cnt DESC
LIMIT 20;

-- ============================================
-- 5. 신고 횟수
-- ============================================
-- 전체 신고 건수 (category/report_type별)
SELECT category, report_type, COUNT(*) AS report_count
FROM report
GROUP BY category, report_type
ORDER BY report_count DESC;

-- 일별 신고 추이
SELECT DATE(report_time) AS report_date, COUNT(*) AS report_count
FROM report
GROUP BY DATE(report_time)
ORDER BY report_date DESC;

-- 신고를 가장 많이 당한 유저 Top 20 (reported_id는 profile.id 기준)
SELECT reported_id, COUNT(*) AS reported_count
FROM report
WHERE reported_id IS NOT NULL
GROUP BY reported_id
ORDER BY reported_count DESC
LIMIT 20;

-- ============================================
-- 6. 앱 다운로드 수 / 알림 설정자 수 (퍼널 데이터)
-- ============================================
-- 알림 설정자 수는 위 2번 쿼리의 service_alarm_on 등으로 이미 커버됨.
-- 앱 다운로드 수는 DB에 존재하지 않음 — App Store Connect / Google Play Console에서 직접 확인 필요.
-- (백엔드 쿼리로는 집계 불가, 참고용으로만 남겨둠)
