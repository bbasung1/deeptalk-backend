#!/bin/bash
# /admin/first_activity 페이지 검증 스크립트
# 사용법: ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test_first_activity.sh [base_url]
#
# 개별 어드민 로그인(JWT) 도입 이후로는 .env의 공용 비밀번호가 아니라
# scripts/create_admin.js로 발급한 계정의 이메일/비밀번호를 환경변수로 넘겨받아 로그인합니다.

set -euo pipefail

BASE_URL="${1:-http://localhost:9300}"
COOKIE_FILE="$(mktemp)"

cleanup() {
    rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
    echo "[FAIL] ADMIN_EMAIL, ADMIN_PASSWORD 환경변수를 설정해주세요."
    echo "       예: ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=... ./scripts/test_first_activity.sh"
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
echo "=== GET /admin/first_activity ==="
body=$(curl -s "$BASE_URL/admin/first_activity" -b "$COOKIE_FILE")

if echo "$body" | grep -q "첫 글 / 첫 반응 시각"; then
    echo "[PASS] 페이지 정상 응답"
else
    echo "[FAIL] 예상한 제목을 찾지 못했습니다. 응답 일부:"
    echo "$body" | head -c 500
    exit 1
fi

echo
echo "=== 서버 생존 확인 ==="
alive_code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$BASE_URL/mention" -H "Authorization: Bearer garbage.invalid.token")
echo "HTTP $alive_code (서버 응답함 = 살아있음)"

echo
echo "=== 결과: PASS ==="
