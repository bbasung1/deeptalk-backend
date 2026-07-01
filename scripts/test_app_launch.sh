#!/bin/bash
# /app_launch (이벤트 수신) + /admin/app_launch_count (집계 페이지) 검증 스크립트
# 사용법: ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test_app_launch.sh <유저 JWT 토큰> [base_url]
# 토큰은 /oauth/jwttest로 받은 걸 그대로 쓰면 됩니다 (sub:1 고정 -> testid1).
# 어드민 로그인은 scripts/create_admin.js로 발급한 계정의 이메일/비밀번호를 환경변수로 넘겨받습니다.

set -euo pipefail

TOKEN="${1:?유저 JWT 토큰을 첫 번째 인자로 넘겨주세요. 예: ./scripts/test_app_launch.sh \"$TOKEN\"}"
BASE_URL="${2:-http://localhost:9300}"
COOKIE_FILE="$(mktemp)"

cleanup() {
    rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

echo "=== POST /app_launch (인증 없이, 401 기대) ==="
no_auth_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/app_launch")
if [ "$no_auth_code" = "401" ]; then
    echo "[OK] 인증 없으면 401"
else
    echo "[FAIL] 인증 없는 요청이 401이 아님 (받은 코드: $no_auth_code)"
    exit 1
fi

echo
echo "=== POST /app_launch (토큰 사용) ==="
body=$(curl -s -X POST "$BASE_URL/app_launch" -H "Authorization: Bearer $TOKEN")
echo "$body"
if echo "$body" | grep -q '"success":1'; then
    echo "[OK] 이벤트 기록 성공"
else
    echo "[FAIL] 이벤트 기록 실패"
    exit 1
fi

echo
echo "=== /admin/login ==="
if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
    echo "[FAIL] ADMIN_EMAIL, ADMIN_PASSWORD 환경변수를 설정해주세요."
    exit 1
fi
curl -s -D - -o /dev/null -X POST "$BASE_URL/admin/login" \
    --data-urlencode "email=$ADMIN_EMAIL" \
    --data-urlencode "password=$ADMIN_PASSWORD" \
    -c "$COOKIE_FILE" > /tmp/admin_login_headers.txt
grep -qi "admin_token" "$COOKIE_FILE" && echo "[OK] 로그인 쿠키 확보"

echo
echo "=== GET /admin/app_launch_count ==="
status_body=$(curl -s "$BASE_URL/admin/app_launch_count" -b "$COOKIE_FILE")
if echo "$status_body" | grep -q "일별 유저별 앱 실행 횟수"; then
    echo "[PASS] 페이지 정상 응답"
else
    echo "[FAIL] 예상한 제목을 찾지 못했습니다. 응답 일부:"
    echo "$status_body" | head -c 500
    exit 1
fi

echo
echo "=== 결과: PASS ==="
