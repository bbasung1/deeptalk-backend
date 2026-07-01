#!/bin/bash
# /admin/admin_message 발송 + 현황 페이지 검증 스크립트
# 사용법: ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test_admin_message.sh <받을 사람의 profile.user_id> [base_url]
# 예: ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=... ./scripts/test_admin_message.sh wodud8148
#
# 개별 어드민 로그인(JWT) 도입 이후로는 .env의 공용 비밀번호가 아니라
# scripts/create_admin.js로 발급한 계정의 이메일/비밀번호를 환경변수로 넘겨받아 로그인합니다.

set -euo pipefail

TARGET_DISPLAY_ID="${1:?대상 유저의 profile.user_id를 첫 번째 인자로 넘겨주세요. 예: ./scripts/test_admin_message.sh wodud8148}"
BASE_URL="${2:-http://localhost:9300}"
COOKIE_FILE="$(mktemp)"
TEST_TITLE="[테스트] $(date +%s)"

cleanup() {
    rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
    echo "[FAIL] ADMIN_EMAIL, ADMIN_PASSWORD 환경변수를 설정해주세요."
    echo "       예: ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=... ./scripts/test_admin_message.sh wodud8148"
    exit 1
fi

echo "=== /admin/login ==="
login_response=$(curl -s -D - -o /dev/null -X POST "$BASE_URL/admin/login" \
    --data-urlencode "email=$ADMIN_EMAIL" \
    --data-urlencode "password=$ADMIN_PASSWORD" \
    -c "$COOKIE_FILE")
login_location=$(echo "$login_response" | grep -i '^location:' | tr -d '\r')
echo "$login_location"

if echo "$login_location" | grep -qi '/admin/member'; then
    echo "[OK] 로그인 성공 (member 페이지로 리다이렉트됨)"
elif echo "$login_location" | grep -qi '^location:[[:space:]]*/admin[[:space:]]*$\|^location:[[:space:]]*/admin$'; then
    echo "[FAIL] 로그인 실패: 이메일/비밀번호를 확인해주세요."
    exit 1
fi

if ! grep -qi "admin_token" "$COOKIE_FILE" 2>/dev/null; then
    echo "[FAIL] 로그인 쿠키를 받지 못했습니다. (Location: $login_location)"
    exit 1
fi
echo "[OK] 로그인 쿠키 확보"

echo
echo "=== POST /admin/admin_message ($TARGET_DISPLAY_ID 에게 발송) ==="
send_response=$(curl -s -D - -o /tmp/admin_message_send_body.html -X POST "$BASE_URL/admin/admin_message" \
    --data-urlencode "target=$TARGET_DISPLAY_ID" \
    --data-urlencode "title=$TEST_TITLE" \
    --data-urlencode "body=테스트 메시지 본문입니다." \
    -b "$COOKIE_FILE")
send_location=$(echo "$send_response" | grep -i '^location:' | tr -d '\r')

if echo "$send_location" | grep -qi '/admin/admin_message'; then
    echo "[OK] 발송 성공 (현황 페이지로 리다이렉트됨)"
else
    echo "[FAIL] 발송이 리다이렉트로 이어지지 않았습니다. 응답 본문 일부:"
    head -c 500 /tmp/admin_message_send_body.html
    exit 1
fi

echo
echo "=== GET /admin/admin_message (현황 확인) ==="
status_body=$(curl -s "$BASE_URL/admin/admin_message" -b "$COOKIE_FILE")

if echo "$status_body" | grep -qF "$TEST_TITLE"; then
    echo "[PASS] 방금 보낸 메시지가 발송 현황에 나타남"
else
    echo "[FAIL] 발송 현황에서 방금 보낸 메시지를 찾지 못했습니다."
    exit 1
fi

echo
echo "=== 결과: PASS ==="
echo "다음으로 DB에서 직접 확인하려면:"
echo "  SELECT * FROM admin_message WHERE title = '$TEST_TITLE';"
echo "유저 앱 쪽(읽음 처리)은 실제 유저 JWT로 다음을 호출해서 확인해주세요:"
echo "  GET  $BASE_URL/admin_message            (Authorization: Bearer <유저 토큰>)"
echo "  PATCH $BASE_URL/admin_message/<id>/read  (Authorization: Bearer <유저 토큰>)"
