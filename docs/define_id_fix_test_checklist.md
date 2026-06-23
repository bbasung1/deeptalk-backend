# define_id 크래시 버그 수정 - 테스트 체크리스트

`general.js`의 `define_id`가 인증 실패 시 truthy 값을 반환하던 버그를 고치면서, 이 함수를 호출하는 모든 라우터에 `if (res.headersSent) return;` 가드를 추가했습니다. 아래는 서버가 죽지 않는지 확인하기 위한 테스트 목록입니다.

공통 테스트 토큰: `Authorization: Bearer garbage.invalid.token` (유효하지 않은 JWT)

## 완료됨 (2026-06-23 확인, 크래시 없음)

- [x] `POST /write` - Bearer 접두사 없는 토큰
- [x] `POST /write` - Authorization 헤더 없음
- [x] `POST /like/:id`
- [x] `DELETE /comment/:comment_id` - 잘못된 토큰
- [x] `DELETE /comment/:comment_id` - 토큰 없음 + 존재하지 않는 댓글
- [x] `DELETE /jam-talk/:id` - 토큰 없음 + 존재하지 않는 글
- [x] `POST /mylist/:id` (bookmark.js)
- [x] `POST /follow/:user_id`
- [x] `GET /vote/:id`
- [x] `POST /fcm/token`
- [x] `PUT /profile/status_msg`
- [x] `POST /profile/block/list`
- [x] `POST /profile/mute/list`
- [x] `PUT /profile/mail`
- [x] `GET /profile/account_info`
- [x] `DELETE /oauth/account`
- [x] `GET /show/quotes/:type/:post_id`
- [x] `DELETE /jin-talk/:id`
- [x] `PATCH /write/:mode/:id`
- [x] `PATCH /write/:mode/:id/mute`
- [x] `PATCH /comment/:comment_id`
- [x] `POST /comment/list`
- [x] `POST /profile/image` (multipart)
- [x] `POST /profile/theme`
- [x] `GET /mention`

## 아직 안 한 것 (같은 패턴, 우선순위 낮음)

옵셔널 인증 라우트 (Authorization 헤더 있을 때만 define_id 호출, 없으면 비로그인으로 처리):

```bash
curl -i http://localhost:9300/jam-talk/1 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/jin-talk/1 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/comment?type=0&post_num=1 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/comment/1 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/like/list?type=0 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/mylist/list?type=0 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/follow/list?type=0 -H "Authorization: Bearer garbage.invalid.token"
curl -i "http://localhost:9300/follow/is_follow?user_id=1" -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/home/Jam-Talk -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/home/Jin-Talk -H "Authorization: Bearer garbage.invalid.token"
```

이전 세션부터 이미 안전했던 라우트 (재확인용, headersSent 가드가 이전부터 있었음):

```bash
curl -i -X POST http://localhost:9300/profile/info -H "Content-Type: application/json" -d '{"user_id":1}' -H "Authorization: Bearer garbage.invalid.token"
curl -i -X PUT http://localhost:9300/profile/id -H "Content-Type: application/json" -d '{"change_id":"test"}' -H "Authorization: Bearer garbage.invalid.token"
curl -i -X POST http://localhost:9300/profile/nickname/register -H "Content-Type: application/json" -d '{"nickname":"test"}' -H "Authorization: Bearer garbage.invalid.token"
curl -i -X POST http://localhost:9300/profile/hide_follow_list -H "Content-Type: application/json" -d '{"hide":true}' -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/show/follow/1 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/show/follower/1 -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/show/comment/1 -H "Authorization: Bearer garbage.invalid.token"
curl -i -X DELETE http://localhost:9300/mention -H "Authorization: Bearer garbage.invalid.token"
curl -i http://localhost:9300/useractivity -H "Authorization: Bearer garbage.invalid.token"
curl -i -X POST http://localhost:9300/report -H "Content-Type: application/json" -d '{}' -H "Authorization: Bearer garbage.invalid.token"
curl -i -X POST http://localhost:9300/profile/block -H "Content-Type: application/json" -d '{"target_id":1}' -H "Authorization: Bearer garbage.invalid.token"
curl -i -X POST http://localhost:9300/profile/mute -H "Content-Type: application/json" -d '{"target_id":1}' -H "Authorization: Bearer garbage.invalid.token"
```

## 확인 기준

모든 케이스에서:
1. 서버 프로세스가 죽지 않아야 함 (다른 요청도 계속 응답)
2. HTTP 응답이 정상적으로 오고 (4xx 류), "Cannot set headers after they are sent" 에러가 서버 로그에 안 보여야 함
