#!/usr/bin/env bash
# 이어쓰기(draft) 기능 end-to-end 테스트.
# 사용법: BASE_URL과 TOKEN을 채운 뒤  bash test_draft_resume.sh
# - jq 필요 (sudo apt install -y jq)
# - 실행 전에 sql/add_comment_draft_column.sql 을 DB에 먼저 적용해야 함.

set -e
BASE_URL="http://localhost:9300"      # deeptalk.js가 9300 포트로 listen함

# 테스트 실행 시에 토큰을 입력할 것!
TOKEN="Bearer " # 로그인 후 발급받은 토큰을 여기에 입력 (예: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }

echo "== 1) 글 임시저장 생성 =="
R=$(curl -s -X POST "$BASE_URL/write/" -H "Authorization: $TOKEN" \
  -F "mode=Jam-Talk" -F "subject=draft test $(date +%s)" -F "draft=1")
echo "$R"
echo "$R" | jq -e '.success == true' >/dev/null || fail "draft 글 생성 실패"
pass "draft 글 생성"

echo "== 2) 내 임시저장 글 목록에서 방금 글 찾기 =="
LIST=$(curl -s "$BASE_URL/write/drafts?mode=Jam-Talk" -H "Authorization: $TOKEN")
POST_ID=$(echo "$LIST" | jq -r '.drafts[0].talk_num // .drafts[0].post_num // .drafts[0].id')
[ -n "$POST_ID" ] && [ "$POST_ID" != "null" ] || fail "drafts 목록에서 글을 찾지 못함"
pass "drafts 목록 조회 (post_id=$POST_ID)"

echo "== 3) 임시저장 글 단건 조회 (이어쓰기 진입) =="
curl -s "$BASE_URL/write/draft/Jam-Talk/$POST_ID" -H "Authorization: $TOKEN" \
  | jq -e '.success == true and .draft.draft == 1' >/dev/null || fail "draft 단건 조회 실패"
pass "draft 단건 조회"

echo "== 4) 이어쓰기 후 발행 (PUT, draft=0) =="
curl -s -X PUT "$BASE_URL/write/Jam-Talk/$POST_ID" -H "Authorization: $TOKEN" \
  -F "subject=draft test continued" -F "draft=0" \
  | jq -e '.success == true' >/dev/null || fail "발행(PUT) 실패"
pass "글 발행"

echo "== 5) 발행 후에는 draft 엔드포인트에서 404 =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/write/draft/Jam-Talk/$POST_ID" -H "Authorization: $TOKEN")
[ "$CODE" = "404" ] || fail "발행된 글이 여전히 draft로 조회됨 (status=$CODE)"
pass "발행 후 draft 조회시 404 확인"

echo
echo "== 6) 댓글 임시저장 생성 (post_num=$POST_ID, type=0) =="
R=$(curl -s -X POST "$BASE_URL/comment/" -H "Authorization: $TOKEN" \
  -F "type=0" -F "post_num=$POST_ID" -F "subject=comment draft test" -F "draft=1")
echo "$R"
echo "$R" | jq -e '.success == true and .draft == 1' >/dev/null || fail "댓글 draft 생성 실패"
COMMENT_ID=$(echo "$R" | jq -r '.comment_id')
pass "댓글 draft 생성 (comment_id=$COMMENT_ID)"

echo "== 7) 내 임시저장 댓글 목록 확인 =="
curl -s "$BASE_URL/comment/drafts" -H "Authorization: $TOKEN" \
  | jq -e --argjson id "$COMMENT_ID" '.drafts | any(.comment_id == $id)' >/dev/null \
  || fail "comment drafts 목록에서 찾지 못함"
pass "comment drafts 목록 조회"

echo "== 8) 비로그인 상태로 댓글 draft 단건 조회 시 404 (타인에게 안 보임) =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/comment/$COMMENT_ID")
[ "$CODE" = "404" ] || fail "비로그인 사용자에게 draft 댓글이 노출됨 (status=$CODE)"
pass "비로그인 시 draft 댓글 비노출 확인"

echo "== 9) 댓글 이어쓰기 후 발행 (PUT, draft=0) =="
curl -s -X PUT "$BASE_URL/comment/$COMMENT_ID" -H "Authorization: $TOKEN" \
  -F "subject=comment draft test continued" -F "draft=0" \
  | jq -e '.success == true' >/dev/null || fail "댓글 발행 실패"
pass "댓글 발행"

echo "== 10) 발행 후에는 비로그인도 조회 가능 =="
curl -s "$BASE_URL/comment/$COMMENT_ID" | jq -e '.success == true and .comment.draft == 0' >/dev/null \
  || fail "발행된 댓글이 공개 조회되지 않음"
pass "발행된 댓글 공개 조회 확인"

echo "== 11) 댓글 목록(GET /comment/)에 발행된 댓글이 포함되는지 확인 =="
curl -s "$BASE_URL/comment/?type=0&post_num=$POST_ID" \
  | jq -e --argjson id "$COMMENT_ID" '.comments | any(.comment_id == $id)' >/dev/null \
  || fail "댓글 목록에 발행된 댓글이 없음"
pass "댓글 목록 포함 확인"

echo
echo "모든 테스트 통과 (이어쓰기 기능 정상 동작)"
