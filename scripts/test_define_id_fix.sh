#!/bin/bash
# define_id 크래시 버그 수정 검증 스크립트
# 사용법: ./scripts/test_define_id_fix.sh [base_url]
# 기본 base_url: http://localhost:9300
#
# 각 요청을 보낸 뒤, 서버가 여전히 응답하는지(=죽지 않았는지)를 바로 다음 요청으로 확인합니다.
# curl이 연결 자체에 실패하면(exit code 7 등) 서버가 죽은 것으로 판단합니다.

BASE_URL="${1:-http://localhost:9300}"
BAD_TOKEN="garbage.invalid.token"
PASS=0
FAIL=0
FAILED_TESTS=()

check_alive() {
    # 서버가 응답하는지 가벼운 요청으로 확인
    curl -s -o /dev/null -m 5 "$BASE_URL/mention" -H "Authorization: Bearer $BAD_TOKEN"
    return $?
}

run_test() {
    local name="$1"
    local method="$2"
    local path="$3"
    shift 3
    local extra_args=("$@")

    local http_code
    http_code=$(curl -s -o /tmp/define_id_test_body.json -w "%{http_code}" -m 5 -X "$method" "$BASE_URL$path" "${extra_args[@]}")
    local curl_exit=$?

    if [ $curl_exit -ne 0 ]; then
        echo "[FAIL] $name -> curl 연결 실패 (exit=$curl_exit) - 서버가 죽었을 가능성이 높습니다"
        FAIL=$((FAIL+1))
        FAILED_TESTS+=("$name (연결 실패)")
        return
    fi

    # 서버가 여전히 살아있는지 한 번 더 확인
    check_alive
    if [ $? -ne 0 ]; then
        echo "[FAIL] $name -> 응답은 받았지만($http_code) 이후 서버가 응답하지 않음 (크래시 의심)"
        FAIL=$((FAIL+1))
        FAILED_TESTS+=("$name (이후 응답 없음)")
        return
    fi

    if [ "$http_code" -ge 500 ]; then
        echo "[WARN] $name -> 5xx 응답($http_code), 서버는 살아있음. 내용 확인 필요"
    else
        echo "[PASS] $name -> $http_code"
    fi
    PASS=$((PASS+1))
}

echo "=== define_id 크래시 버그 수정 검증 시작 ($BASE_URL) ==="
echo

run_test "POST /write (no Bearer prefix)" POST "/write" \
    -H "Authorization: $BAD_TOKEN" -F "mode=Jam-Talk" -F "subject=test"

run_test "POST /write (no auth header)" POST "/write" \
    -F "mode=Jam-Talk" -F "subject=test"

run_test "POST /like/:id" POST "/like/1" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"type":0}'

run_test "DELETE /comment/:id (invalid token)" DELETE "/comment/999999999" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "DELETE /comment/:id (no token, not found)" DELETE "/comment/999999999"

run_test "DELETE /jam-talk/:id (no token, not found)" DELETE "/jam-talk/999999999"

run_test "DELETE /jin-talk/:id (no token, not found)" DELETE "/jin-talk/999999999"

run_test "POST /mylist/:id" POST "/mylist/1" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"type":0}'

run_test "POST /follow/:user_id" POST "/follow/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /vote/:id" GET "/vote/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "POST /fcm/token" POST "/fcm/token" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"type":"android","token":"x"}'

run_test "PUT /profile/status_msg" PUT "/profile/status_msg" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"msg":"test"}'

run_test "POST /profile/block/list" POST "/profile/block/list" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "POST /profile/mute/list" POST "/profile/mute/list" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "PUT /profile/mail" PUT "/profile/mail" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"mail":"a@a.com"}'

run_test "GET /profile/account_info" GET "/profile/account_info" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "DELETE /oauth/account" DELETE "/oauth/account" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /show/quotes/:type/:post_id" GET "/show/quotes/free/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "PATCH /write/:mode/:id" PATCH "/write/Jam-Talk/1" \
    -H "Authorization: Bearer $BAD_TOKEN" -F "subject=test"

run_test "PATCH /write/:mode/:id/mute" PATCH "/write/Jam-Talk/1/mute" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"mute":true}'

run_test "PATCH /comment/:id" PATCH "/comment/1" \
    -H "Authorization: Bearer $BAD_TOKEN" -F "subject=test"

run_test "POST /comment/list" POST "/comment/list" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "POST /profile/image" POST "/profile/image" \
    -H "Authorization: Bearer $BAD_TOKEN" -F "file=@/dev/null"

run_test "POST /profile/theme" POST "/profile/theme" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"theme":"dark"}'

run_test "GET /mention" GET "/mention" \
    -H "Authorization: Bearer $BAD_TOKEN"

# 아직 한번도 안 해본 것들 (옵셔널 인증 라우트 + 기존 안전 라우트 재확인)
run_test "GET /jam-talk/:id" GET "/jam-talk/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /jin-talk/:id" GET "/jin-talk/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /comment (list)" GET "/comment?type=0&post_num=1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /comment/:id (single)" GET "/comment/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /like/list" GET "/like/list?type=0" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /mylist/list" GET "/mylist/list?type=0" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /follow/list" GET "/follow/list?type=0" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /follow/is_follow" GET "/follow/is_follow?user_id=1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /home/Jam-Talk" GET "/home/Jam-Talk" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /home/Jin-Talk" GET "/home/Jin-Talk" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "POST /profile/info" POST "/profile/info" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"user_id":1}'

run_test "PUT /profile/id" PUT "/profile/id" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"change_id":"test"}'

run_test "POST /profile/nickname/register" POST "/profile/nickname/register" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"nickname":"test"}'

run_test "POST /profile/hide_follow_list" POST "/profile/hide_follow_list" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"hide":true}'

run_test "GET /show/follow/:user_id" GET "/show/follow/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /show/follower/:user_id" GET "/show/follower/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /show/comment/:comment_id" GET "/show/comment/1" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "GET /useractivity" GET "/useractivity" \
    -H "Authorization: Bearer $BAD_TOKEN"

run_test "POST /report" POST "/report" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{}'

run_test "POST /profile/block" POST "/profile/block" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"target_id":1}'

run_test "POST /profile/mute" POST "/profile/mute" \
    -H "Authorization: Bearer $BAD_TOKEN" -H "Content-Type: application/json" -d '{"target_id":1}'

echo
echo "=== 결과: PASS=$PASS FAIL=$FAIL ==="
if [ $FAIL -gt 0 ]; then
    echo "실패한 테스트:"
    for t in "${FAILED_TESTS[@]}"; do
        echo "  - $t"
    done
    exit 1
fi
exit 0
