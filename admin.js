const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
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
  <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a><a href="/admin/post">글 현황 페이지로</a><br>
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
            <a href="/admin/logout">logout <a href="/admin/setblock">신고 현황 페이지로 </a><a href="/admin/post">글 현황 페이지로</a><br>
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
        <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a><br>
<h1>글 목록</h1>
<table border="1">
<tr>
    <td>게시물 유형</td>
    <td>게시물 번호</td>
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
    const [tmp1, tmp2] = await Promise.all([knex("talk").select("*"), knex("think").select("*")]);
    tmp3 = [...tmp1, ...tmp2];
    tmp3.sort((a, b) => {
        return new Date(a.timestamp) - new Date(b.timestamp);
    });
    for (i of tmp3) {
        console.log(i);
        data += `
        <tr>
    <td>${i.talk_num ? "jam-talk" : "jin-talk"}</td>
    <td>${i.talk_num || i.think_num}</td>
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
module.exports = router;
