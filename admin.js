const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();
const session = [];
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// const { stream } = require("./log.js");
// const morgan = require("morgan");
// router.use(
//   morgan(
//     "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
//     { stream: stream }
//   )
// );

function admin_html(title, body, res) {
    let data = `
    <!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <meta charset="utf-8">
</head>
<body>
${body}
</body>
</html>
    `;
    //res.writeHead(200);
    res.end(data);
}
function admin_block(res) {
    let data = `
  <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a><a href="/admin/post">글 현황 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
  <h1>신고 명단</h1>
    <table border="1">
    <tr>
    <td>신고번호</td>
    <td>신고자 id</td>
    <td>신고된 id</td>
    <td>게시물 유형</td>
    <td>게시물 id</td>
    <td>사유</td>
    <td>신고일자</td>
    <td>차단여부</td>
</tr>
    `;
    knex
        .select()
        .from("report")
        .then((list1) => {
            for (test of list1) {
                data += `<tr><td>` + test.report_id + `</td>`;
                data += `<td>` + test.reporter_id + `</td>`;
                data += `<td>` + test.reported_id + `</td>`;
                data += `<td>` + test.type + `</td>`;
                data += `<td>` + test.post_id + `</td>`;
                data += `<td>` + test.reason + `</td>`;
                data += `<td>` + test.report_time.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + `</td>`;
                data += `<td>` + test.decision + `</td></tr>`;
            }
            data += `</table>`;
            admin_html("신고현황", data, res);
        });
}
// 

async function member(res) {
    try {
        const [count, all_member_info, [delete_user]] = await Promise.all([
            knex('user')
                .select(
                    knex.raw('COUNT(*) as total'),
                    knex.raw('SUM(IF(deletetime IS NULL, 1, 0)) as activeCount')
                )
                .first(),
            knex
                .select('*')
                .from("user")
                .leftJoin("profile", "profile.id", "user.id"),
            knex('delete_reason')
                .whereNotIn('id', knex.select('id').from('user'))
                .count('id as count')
        ]);
        let data = `
            <a href="/admin/logout">logout <a href="/admin/setblock">신고 현황 페이지로 </a><a href="/admin/post">글 현황 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>회원 통계</h1>
            <table border="1">
                <tr>
                    <td>탈퇴한 회원</td>
                    <td>총 가입한 회원</td>
                    <td>현재 가입된 회원</td>
                </tr>
                <tr>
                    <td>${delete_user.count}</td>
                    <td>${count.activeCount + delete_user.count}</td>
                    <td>${count.total}</td>
                </tr>
            </table>

            <h1>회원 명단</h1>
            <table border="1">
                <tr>
                    <td>번호</td>
                    <td>id</td>
                    <td>이메일</td>
                    <td>생년월일</td>
                    <td>가입유형</td>
                    <td>생성날짜</td>
                    <td>서비스알림</td>
                    <td>활동알림</td>
                    <td>마케팅알림</td>
                </tr>
        `;

        // 4. 조회된 회원 명단으로 테이블 내용 채우기
        for (const test of all_member_info) {
            const tmp = new Date(test.birthdate)
            birthdate = tmp.getUTCFullYear() + "년" + (tmp.getUTCMonth() + 1) + "월" + tmp.getUTCDate() + "일";
            // birthdate = tmp.getFullYear();
            data += `
                <tr>
                    <td>${test.id}</td>
                    <td>${test.user_id}</td>
                    <td>${test.email}</td>
                    <td>${birthdate}</td>
                    <td>${test.kakao_id ? '카카오' : '애플'}</td>
                    <td>${test.created_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                    <td>${test.servicealram}</td>
                    <td>${test.useralram}</td>
                    <td>${test.marketalram}</td>
                </tr>
            `;
        }

        data += `</table>`;

        // 5. 완성된 HTML을 전송
        admin_html("회원 명단 및 통계", data, res);

    } catch (error) {
        // 에러 처리
        console.error("Error in member function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

async function post(res) {
    let data = `
        <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
<h1>글 목록</h1>
<table border="1">
<tr>
    <td>게시물 유형</td>
    <td>게시물 번호</td>
    <td>작성자</td>
    <td>제목</td>
    <td>내용</td>
    <td>사진</td>
    <td>인용</td>
    <td>게시 날짜</td>
    <td>좋아요</td>
    <td>인용수</td>
    <td>댓글수</td>
    <td>북마크수</td>
    <td>조회수</td>
</tr>
  `;
    // const test = await knex.select("*").from('talk').union(function () { this.select('think_num as id', 'writer_id', 'header', 'subject', 'reported', 'timestamp', 'like', 'quote', 'comment', 'mylist', 'views').from('think') });
    // const [tmp1, tmp2] = await Promise.all([knex("talk").select("*"), knex("think").select("*")]);
    // tmp3 = [...tmp1, ...tmp2];
    // tmp3.sort((a, b) => {
    //     return new Date(a.timestamp) - new Date(b.timestamp);
    // });
    const combinedData = await knex
        .select([
            'timestamp',
            'talk_num',
            knex.raw('NULL AS think_num'), // Alias NULL for think_num in the 'talk' selection
            'header',
            'writer_id',
            'subject',
            'quote',
            'photo',
            'comment',
            'like', // 'like' is a reserved keyword, so it's often quoted
            'quote_num',
            'views',
            'mylist',
        ])
        .from('talk')
        .unionAll([
            knex
                .select([
                    'timestamp',
                    knex.raw('NULL AS talk_num'), // Alias NULL for talk_num in the 'think' selection
                    'think_num',
                    'header',
                    'writer_id',
                    'subject',
                    'quote',
                    'photo',
                    'comment',
                    'like', // 'like' is a reserved keyword, so it's often quoted
                    'quote_num',
                    'views',
                    'mylist',
                ])
                .from('think'),
        ])
        .orderBy('timestamp', 'asc');
    for (i of combinedData) {
        console.log(i);
        data += `
        <tr>
    <td>${i.talk_num ? "jam-talk" : "jin-talk"}</td>
    <td>${i.talk_num || i.think_num}</td>
    <td>${i.writer_id}</td>
    <td>${i.header}</td>
    <td>${i.subject}</td>
    <td>${i.photo}</td>
    <td>${i.quote}</td>
    <td>${i.timestamp.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
    <td>${i.like}</td>
    <td>${i.quote_num}</td>
    <td>${i.comment}</td>
    <td>${i.mylist}</td>
    <td>${i.views}</td>
</tr>
        `
    }
    data += `
    </table>
    `
    admin_html("posttest", data, res);
}

// 접속 간격이 이 값(분) 이상 벌어지면 새 세션으로 간주한다.
// login_log는 oauth 재로그인뿐 아니라 자체 JWT 갱신(jamdeeptalk, 앱 재실행 시)도 기록하므로
// 이 값을 기준으로 "하루에 몇 번 들어왔는지"를 근사할 수 있다.
const SESSION_GAP_MINUTES = 30;

async function session_count(res) {
    try {
        // login_log를 user_id, created_at 순으로 본 뒤, 바로 앞 행과의 간격이
        // SESSION_GAP_MINUTES 이상이거나(또는 그 유저의 첫 로그) 새 세션 시작으로 표시(LAG 윈도우 함수).
        // 그렇게 표시된 행만 날짜별로 세면 유저별 일별 세션 횟수가 됨.
        const [rows] = await knex.raw(
            `
            WITH flagged AS (
                SELECT
                    l.user_id,
                    l.created_at,
                    LAG(l.created_at) OVER (PARTITION BY l.user_id ORDER BY l.created_at) AS prev_created_at
                FROM login_log l
            )
            SELECT
                f.user_id AS id,
                p.user_id AS profile_user_id,
                DATE(f.created_at) AS log_date,
                COUNT(*) AS session_count
            FROM flagged f
            JOIN user u ON u.id = f.user_id
            LEFT JOIN profile p ON p.id = u.id
            WHERE f.prev_created_at IS NULL
               OR TIMESTAMPDIFF(MINUTE, f.prev_created_at, f.created_at) >= ?
            GROUP BY f.user_id, p.user_id, DATE(f.created_at)
            ORDER BY f.user_id ASC, log_date ASC
            `,
            [SESSION_GAP_MINUTES]
        );

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>일별 유저별 세션 횟수 (접속 간격 ${SESSION_GAP_MINUTES}분 기준)</h1>
            <table border="1">
                <tr>
                    <td>id</td>
                    <td>날짜</td>
                    <td>세션 횟수</td>
                </tr>
        `;
        for (const row of rows) {
            const dateStr = row.log_date instanceof Date
                ? row.log_date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
                : row.log_date;
            data += `
                <tr>
                    <td>${row.profile_user_id ?? row.id}</td>
                    <td>${dateStr}</td>
                    <td>${row.session_count}</td>
                </tr>
            `;
        }
        data += `</table>`;
        admin_html("일별 유저별 세션 횟수", data, res);
    } catch (error) {
        console.error("Error in session_count function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

async function first_activity(res) {
    try {
        // content_event_log는 talk/think/comment/post_like가 하드 삭제돼도 남는 append-only 로그라서
        // 삭제된 글/반응까지 포함해 "첫 활동 시각"을 정확히 집계할 수 있음.
        const rows = await knex("content_event_log as e")
            .join("user as u", "u.id", "e.user_id")
            .leftJoin("profile as p", "p.id", "u.id")
            .select(
                "u.id",
                "p.user_id",
                knex.raw("MIN(CASE WHEN e.event_type IN ('post_talk', 'post_think') THEN e.created_at END) as first_post_at"),
                knex.raw("MIN(CASE WHEN e.event_type IN ('comment', 'like') THEN e.created_at END) as first_reaction_at")
            )
            .groupBy("u.id", "p.user_id")
            .orderBy("u.id", "asc");

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>첫 글 / 첫 반응 시각</h1>
            <table border="1">
                <tr>
                    <td>id</td>
                    <td>첫 글 작성 시각</td>
                    <td>첫 반응(좋아요/댓글) 시각</td>
                </tr>
        `;
        for (const row of rows) {
            data += `
                <tr>
                    <td>${row.user_id}</td>
                    <td>${row.first_post_at ? row.first_post_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}</td>
                    <td>${row.first_reaction_at ? row.first_reaction_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}</td>
                </tr>
            `;
        }
        data += `</table>`;
        admin_html("첫 글 / 첫 반응 시각", data, res);
    } catch (error) {
        console.error("Error in first_activity function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

// 어드민이 유저에게 메시지(1:1 또는 공지)를 보내고 읽음 현황을 보는 페이지.
// 공지는 발송 시점에 대상 유저마다 한 행씩 insert해서, mention과 달리 "확인 여부"뿐 아니라
// "확인 시각"까지 각자 추적할 수 있게 한다(admin_message.read_at, admin_message.js에서 갱신).
async function admin_message_page(res) {
    try {
        // 같은 발송 건(group_id)을 하나로 묶어서 제목/발송시각/대상수/읽은수를 보여줌
        const groups = await knex("admin_message as m")
            .select(
                "m.group_id",
                knex.raw("MIN(m.title) as title"),
                knex.raw("MIN(m.created_at) as created_at"),
                knex.raw("COUNT(*) as total_count"),
                knex.raw("SUM(m.is_read) as read_count")
            )
            .groupBy("m.group_id")
            .orderBy("created_at", "desc");

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>어드민 메시지 보내기</h1>
            <form method="post" action="/admin/admin_message">
                <label>대상 (profile의 id를 쉼표로 구분 / 전체 발송은 "all"):</label><br>
                <input type="text" name="target" style="width:400px" placeholder="wodud8148, nmixx 또는 all"/><br>
                <label>제목:</label><br>
                <input type="text" name="title" style="width:400px"/><br>
                <label>내용:</label><br>
                <textarea name="body" rows="4" style="width:400px"></textarea><br>
                <input type="submit" value="보내기"/>
            </form>

            <h1>발송 현황</h1>
            <table border="1">
                <tr>
                    <td>발송 시각</td>
                    <td>제목</td>
                    <td>대상 수</td>
                    <td>읽은 수</td>
                </tr>
        `;
        for (const g of groups) {
            data += `
                <tr>
                    <td>${g.created_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                    <td>${g.title}</td>
                    <td>${g.total_count}</td>
                    <td>${g.read_count}</td>
                </tr>
            `;
        }
        data += `</table>`;
        admin_html("어드민 메시지", data, res);
    } catch (error) {
        console.error("Error in admin_message_page function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

async function send_admin_message(req, res) {
    try {
        const target = (req.body.target || "").trim();
        const title = (req.body.title || "").trim();
        const body = (req.body.body || "").trim();

        if (!target || !title || !body) {
            return res.end("<h1>대상/제목/내용을 모두 입력해주세요.</h1>");
        }

        let targetIds;
        if (target.toLowerCase() === "all") {
            // 탈퇴하지 않은 유저 전체
            const rows = await knex("user").select("id").whereNull("deletetime");
            targetIds = rows.map((r) => r.id);
        } else {
            // profile.user_id(표시용 아이디) 기준으로 입력받아 내부 id로 변환
            const displayIds = target.split(",").map((s) => s.trim()).filter(Boolean);
            const rows = await knex("profile as p")
                .join("user as u", "u.id", "p.id")
                .whereIn("p.user_id", displayIds)
                .whereNull("u.deletetime")
                .select("u.id");
            targetIds = rows.map((r) => r.id);
        }

        if (targetIds.length === 0) {
            return res.end("<h1>대상 유저를 찾지 못했습니다. id를 다시 확인해주세요.</h1>");
        }

        const group_id = crypto.randomUUID();
        const insertRows = targetIds.map((user_id) => ({ group_id, user_id, title, body }));
        await knex("admin_message").insert(insertRows);

        res.redirect("/admin/admin_message");
    } catch (error) {
        console.error("Error in send_admin_message function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

// 일별 유저별 앱 실행 횟수. app_launch_event는 프론트가 포그라운드 진입마다 보내는
// 별도 이벤트라서, login_log(재로그인/토큰갱신 시점)와 달리 토큰이 살아있는 채로
// 다시 연 경우까지 잡힘. 세션처럼 간격으로 묶지 않고 이벤트 자체를 그대로 카운트함
// (몇 번 "열었는지"가 목적이라 30분 이내 여러 번 열어도 각각 카운트하는 게 맞음).
async function app_launch_count(res) {
    try {
        const rows = await knex("app_launch_event as e")
            .join("user as u", "u.id", "e.user_id")
            .leftJoin("profile as p", "p.id", "u.id")
            .select(
                "e.user_id as id",
                "p.user_id as profile_user_id",
                knex.raw("DATE(e.created_at) as log_date"),
                knex.raw("COUNT(*) as launch_count")
            )
            .groupBy("e.user_id", "p.user_id", knex.raw("DATE(e.created_at)"))
            .orderBy("e.user_id", "asc")
            .orderBy("log_date", "asc");

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a><br>
            <h1>일별 유저별 앱 실행 횟수</h1>
            <table border="1">
                <tr>
                    <td>id</td>
                    <td>날짜</td>
                    <td>실행 횟수</td>
                </tr>
        `;
        for (const row of rows) {
            const dateStr = row.log_date instanceof Date
                ? row.log_date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
                : row.log_date;
            data += `
                <tr>
                    <td>${row.profile_user_id ?? row.id}</td>
                    <td>${dateStr}</td>
                    <td>${row.launch_count}</td>
                </tr>
            `;
        }
        data += `</table>`;
        admin_html("일별 유저별 앱 실행 횟수", data, res);
    } catch (error) {
        console.error("Error in app_launch_count function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

function login(res) {
    let data = `
  <form method="post" action="/admin/login">
  <label>passwd:</label>
  <input type="password" name="passwd"/>
  <input type="submit" value="login"/>
  </form>
  `;
    admin_html("로그인", data, res);
}
function check_login(genfunc, req, res) {
    if (req.headers.cookie) {
        genfunc;
    } else {
        res.redirect("/admin");
    }
}
function logout(req, res) {
    const [, privatekey] = req.headers.cookie.split("=");
    temp = session.findIndex((v) => v == privatekey);
    session.splice(temp, 1);
    res.setHeader("Set-Cookie", "connect.id=delete;Max-age=0;");
    res.redirect("/admin");
}
router.get("/", (req, res) => {
    login(res);
});
router.post("/login", (req, res) => {
    const temp = req.body.passwd == process.env.passwd;
    if (temp) {
        const privatekey = Math.floor(Math.random() * 1000000);
        session.push(privatekey);
        res.setHeader("Set-Cookie", `connect.id=${privatekey}`);
        res.redirect("/admin/member");
    } else {
        res.redirect("/admin");
    }
});
router.get("/setblock", (req, res) => {
    check_login(admin_block(res), req, res);
});
router.get("/logout", (req, res) => {
    check_login(logout(req, res), req, res);
});
router.get("/member", (req, res) => {
    check_login(member(res), req, res);
});
router.get("/post", (req, res) => {
    check_login(post(res), req, res);
});
router.get("/first_activity", (req, res) => {
    check_login(first_activity(res), req, res);
});
router.get("/session_count", (req, res) => {
    check_login(session_count(res), req, res);
});
router.get("/admin_message", (req, res) => {
    check_login(admin_message_page(res), req, res);
});
router.post("/admin_message", (req, res) => {
    check_login(send_admin_message(req, res), req, res);
});
router.get("/app_launch_count", (req, res) => {
    check_login(app_launch_count(res), req, res);
});
module.exports = router;
