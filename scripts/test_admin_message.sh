#!/bin/bash
# /admin/admin_message 발송 + 현황 페이지 검증 스크립트
# 사용법: ./scripts/test_admin_message.sh <받을 사람의 profile.user_id> [base_url]
# 예: ./scripts/test_admin_message.sh wodud8148
#
# .env의 admin 비밀번호(passwd)를 코드에 직접 적지 않고 .env에서 읽어와 사용합니다.

set -euo pipefail

TARGET_DISPLAY_ID="${1:?대상 유저의 profile.user_id를 첫 번째 인자로 넘겨주세요. 예: ./scripts/test_admin_message.sh wodud8148}"
BASE_URL="${2:-http://localhost:9300}"
ENV_FILE=".env"
COOKIE_FILE="$(mktemp)"
TEST_TITLE="[테스트] $(date +%s)"

cleanup() {
    rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

if [ ! -f "$ENV_FILE" ]; then
    echo "[FAIL] $ENV_FILE 을 찾을 수 없습니다. deeptalk-backend 루트에서 실행해주세요."
    exit 1
fi

ADMIN_PASSWD="$(grep -E '^passwd=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e "s/^['\"]//" -e "s/['\"]\$//")"

if [ -z "$ADMIN_PASSWD" ]; then
    echo "[FAIL] .env에서 passwd 값을 찾지 못했습니다."
    exit 1
fi

echo "=== /admin/login ==="
login_response=$(curl -s -D - -o /dev/null -X POST "$BASE_URL/admin/login" \
    --data-urlencode "passwd=$ADMIN_PASSWD" \
    -c "$COOKIE_FILE")
login_location=$(echo "$login_response" | grep -i '^location:' | tr -d '\r')
echo "$login_location"

if echo "$login_location" | grep -qi '/admin/member'; then
    echo "[OK] 로그인 성공 (member 페이지로 리다이렉트됨)"
elif echo "$login_location" | grep -qi '^location:[[:space:]]*/admin[[:space:]]*$\|^location:[[:space:]]*/admin$'; then
    echo "[FAIL] 로그인 실패: 비밀번호가 process.env.passwd와 일치하지 않습니다."
    exit 1
fi

if ! grep -qi "connect.id" "$COOKIE_FILE" 2>/dev/null; then
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
