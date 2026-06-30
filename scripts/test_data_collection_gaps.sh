#!/bin/bash
# 노션 "데이터 수집 가능 여부" 스펙 대비 누락 4건 검증 스크립트:
#   1) login_log / app_launch_event 의 device_type
#   2) sessions 테이블 (진짜 세션 시작/종료)
#   3) user_access_logs (일별 접속 기록)
#   4) admin_messages / admin_message_reads (분리된 어드민 메시지)
#
# admin_message 발송/현황 자체는 scripts/test_admin_message.sh 가 이미 다루므로
# (이제 새 admin_messages/admin_message_reads 테이블 기준으로 동작) 이 스크립트는
# 나머지 3건 + admin_message_page에 새로 추가된 "대상 구분" 컬럼만 추가로 확인합니다.
#
# 사용법: ./scripts/test_data_collection_gaps.sh <유저 JWT> [base_url]
#   <유저 JWT>: 실제 앱 로그인으로 발급받은 Bearer 토큰 (Authorization 헤더의 "Bearer " 다음 값)
# 예: ./scripts/test_data_collection_gaps.sh eyJhbGciOi...

set -euo pipefail

USER_TOKEN="${1:?유저 JWT를 첫 번째 인자로 넘겨주세요. 예: ./scripts/test_data_collection_gaps.sh <token>}"
BASE_URL="${2:-http://localhost:9300}"
AUTH_HEADER="Authorization: Bearer $USER_TOKEN"

echo "=== 1) POST /app_launch (device_type 저장 확인) ==="
launch_body=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/app_launch" \
    -H "$AUTH_HEADER" \
    --data-urlencode "device_type=ios")
echo "$launch_body"
echo "-> DB 확인: SELECT user_id, device_type, created_at FROM app_launch_event ORDER BY id DESC LIMIT 1;"

echo
echo "=== 2) user_access_logs (define_id 통과 시 자동 기록되는지 확인) ==="
echo "위 1번 호출이 define_id를 통과했으므로 자동으로 오늘 날짜 행이 생겼어야 합니다."
echo "-> DB 확인: SELECT * FROM user_access_logs WHERE access_date = CURDATE() ORDER BY id DESC LIMIT 1;"
echo "-> 같은 호출을 한 번 더 보내도(아래) 행이 늘어나지 않아야 합니다(UNIQUE KEY + INSERT IGNORE)."
curl -s -o /dev/null -w "두 번째 호출 HTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/app_launch" \
    -H "$AUTH_HEADER" \
    --data-urlencode "device_type=ios"

echo
echo "=== 3) POST /session (세션 시작) ==="
session_response=$(curl -s -X POST "$BASE_URL/session" \
    -H "$AUTH_HEADER" \
    --data-urlencode "device_type=android")
echo "$session_response"
SESSION_ID=$(echo "$session_response" | sed -n 's/.*"session_id":\s*\([0-9]\+\).*/\1/p')

if [ -z "$SESSION_ID" ]; then
    echo "[FAIL] session_id를 응답에서 찾지 못했습니다. 응답을 확인해주세요."
    exit 1
fi
echo "[OK] session_id=$SESSION_ID"

echo
echo "=== 4) PATCH /session/$SESSION_ID/end (세션 종료) ==="
sleep 2
end_response=$(curl -s -X PATCH "$BASE_URL/session/$SESSION_ID/end" -H "$AUTH_HEADER")
echo "$end_response"
echo "-> duration_seconds가 2 이상으로 채워졌는지 확인하세요."

echo
echo "=== 5) 같은 세션을 다시 종료해도 에러 없이 멱등하게 처리되는지 ==="
end_response2=$(curl -s -X PATCH "$BASE_URL/session/$SESSION_ID/end" -H "$AUTH_HEADER")
echo "$end_response2"

echo
echo "=== 6) GET /admin_message (분리된 테이블 기준 내 메시지 조회) ==="
my_messages=$(curl -s "$BASE_URL/admin_message" -H "$AUTH_HEADER")
echo "$my_messages"
echo "-> is_read가 false/0인 메시지의 id를 골라 아래로 읽음 처리 테스트:"
echo "   curl -X PATCH $BASE_URL/admin_message/<id>/read -H 'Authorization: Bearer $USER_TOKEN'"

echo
echo "=== 결과: 위 출력들을 직접 확인해주세요 (자동 PASS/FAIL 판정이 어려운 항목 포함) ==="
echo "DB에서 한 번에 확인하려면:"
echo "  SELECT * FROM login_log ORDER BY id DESC LIMIT 5;"
echo "  SELECT * FROM app_launch_event ORDER BY id DESC LIMIT 5;"
echo "  SELECT * FROM user_access_logs ORDER BY id DESC LIMIT 5;"
echo "  SELECT * FROM sessions ORDER BY id DESC LIMIT 5;"
echo "  SELECT * FROM admin_messages ORDER BY id DESC LIMIT 5;"
echo "  SELECT * FROM admin_message_reads ORDER BY id DESC LIMIT 5;"
