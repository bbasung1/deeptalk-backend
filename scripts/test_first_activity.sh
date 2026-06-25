#!/bin/bash
# /admin/first_activity 페이지 검증 스크립트
# 사용법: ./scripts/test_first_activity.sh [base_url]
#
# .env의 admin 비밀번호(passwd)를 코드에 직접 적지 않고 .env에서 읽어와 사용합니다.
# .env 파일 자체나 그 내용을 출력하지 않도록 주의해서 작성했습니다.

set -euo pipefail

BASE_URL="${1:-http://localhost:9300}"
ENV_FILE=".env"
COOKIE_FILE="$(mktemp)"

cleanup() {
    rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

if [ ! -f "$ENV_FILE" ]; then
    echo "[FAIL] $ENV_FILE 을 찾을 수 없습니다. deeptalk-backend 루트에서 실행해주세요."
    exit 1
fi

# .env에서 passwd= 로 시작하는 줄만 안전하게 추출 (다른 키들은 읽지 않음)
# 앞뒤 따옴표(' 또는 ")와 공백이 붙어있어도 제거해서 dotenv가 파싱한 값과 동일하게 맞춤
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
