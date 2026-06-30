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
  <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a><a href="/admin/post">글 현황 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a> <a href="/admin/report_actions">신고 처리 내역 페이지로</a> <a href="/admin/report_evidence_snapshots">신고 증거 스냅샷 페이지로</a> <a href="/admin/audit_logs">어드민 감사 로그 페이지로</a><br>
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
    <td>처리상태</td>
    <td>상태 변경</td>
    <td>처리 내역</td>
    <td>증거 스냅샷</td>
</tr>
    `;
    knex
        .select()
        .from("report")
        .then((list1) => {
            for (test of list1) {
                data += `<tr><td>` + escapeHtml(test.report_id) + `</td>`;
                data += `<td>` + escapeHtml(test.reporter_id) + `</td>`;
                data += `<td>` + escapeHtml(test.reported_id) + `</td>`;
                data += `<td>` + escapeHtml(test.type) + `</td>`;
                data += `<td>` + escapeHtml(test.post_id) + `</td>`;
                data += `<td>` + escapeHtml(test.reason) + `</td>`;
                data += `<td>` + test.report_time.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + `</td>`;
                data += `<td>` + escapeHtml(test.status) + `</td>`;
                data += `<td>
                    <form method="post" action="/admin/setblock/status" style="display:flex;gap:4px;">
                        <input type="hidden" name="report_id" value="${escapeHtml(test.report_id)}"/>
                        <select name="action_type">
                            <option value="warning">warning</option>
                            <option value="content_deleted">content_deleted</option>
                            <option value="account_suspended">account_suspended</option>
                            <option value="account_banned">account_banned</option>
                            <option value="dismissed">dismissed</option>
                            <option value="no_action">no_action</option>
                        </select>
                        <input type="text" name="memo" placeholder="메모"/>
                        <input type="submit" value="처리"/>
                    </form>
                </td>
                <td><a href="/admin/report_actions?report_id=${escapeHtml(test.report_id)}">내역 보기</a></td>
                <td><a href="/admin/report_evidence_snapshots?report_id=${escapeHtml(test.report_id)}">스냅샷 보기</a></td>
                </tr>`;
            }
            data += `</table>`;
            admin_html("신고현황", data, res);
        });
}

// HTML 출력에 그대로 끼워넣는 값(신고 사유, 메모 등 사용자/관리자 입력 포함)은 항상 이 함수로 escape.
// XSS 방지용 — report_actions_page처럼 자유 텍스트(memo)를 보여주는 화면에서는 반드시 사용.
function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// 어드민 운영 행위 감사 로그(admin_audit_logs) 기록 헬퍼.
// admin.js는 아직 개별 관리자 로그인이 없어 admin_id는 항상 NULL(개편 시 연결 예정, sql/add_admin_audit_logs_table.sql 참고).
// detail에는 비밀번호/토큰 등 민감정보를 절대 넣지 말 것 — 이 함수를 호출하는 곳에서 직접 주의해야 함.
// 감사 로그 기록 실패가 본래 동작(신고 처리, 메시지 발송 등)을 막아서는 안 되므로 에러는 흡수만 함.
async function logAdminAction({ action, target_type = null, target_id = null, detail = null }) {
    try {
        await knex("admin_audit_logs").insert({
            admin_id: null,
            action,
            target_type,
            target_id: target_id === null || target_id === undefined ? null : String(target_id),
            detail,
        });
    } catch (err) {
        console.error("Error in logAdminAction:", err);
    }
}

// 신고 처리 상태 변경 + 처리 내역(report_actions) 기록.
// admin.js는 개별 관리자 로그인이 없어 admin_id는 NULL로 기록함(개편 시 연결 예정).
// report.status는 처리 라이프사이클만 담당 (dismissed는 더 이상 status 값이 아님 — sql/alter_report_status_enum_v2.sql 참고).
// "어떻게 처리됐는지"는 report_actions.action_type에 그대로 기록되므로 정보 손실 없음.
const REPORT_ACTION_TO_STATUS = {
    warning: "resolved",
    content_deleted: "resolved",
    account_suspended: "resolved",
    account_banned: "resolved",
    dismissed: "resolved",
    no_action: "reviewing",
};
async function update_report_status(req, res) {
    try {
        const report_id = parseInt(req.body.report_id);
        const { action_type, memo } = req.body;
        if (isNaN(report_id) || !Object.prototype.hasOwnProperty.call(REPORT_ACTION_TO_STATUS, action_type)) {
            return res.end("<h1>잘못된 요청입니다.</h1>");
        }
        const status = REPORT_ACTION_TO_STATUS[action_type];
        const trx = await knex.transaction();
        try {
            await trx("report").where("report_id", report_id).update({ status });
            await trx("report_actions").insert({
                report_id,
                admin_id: null,
                action_type,
                memo: memo || null,
            });
            await trx.commit();
        } catch (err) {
            await trx.rollback();
            throw err;
        }
        await logAdminAction({
            action: "report_status_change",
            target_type: "report",
            target_id: report_id,
            detail: `action_type=${action_type}, status=${status}`,
        });
        res.redirect("/admin/setblock");
    } catch (error) {
        console.error("Error in update_report_status function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}
//

// 신고 처리 내역(report_actions) 조회 화면.
// report_id 쿼리 파라미터를 주면 해당 신고 1건의 처리 이력만, 없으면 전체 이력을 최신순으로 보여줌.
async function report_actions_page(req, res) {
    try {
        let reportId = null;
        if (req.query.report_id !== undefined) {
            reportId = parseInt(req.query.report_id, 10);
            if (isNaN(reportId) || reportId <= 0) {
                return res.end("<h1>잘못된 요청입니다.</h1>");
            }
        }

        const query = knex("report_actions as ra")
            .join("report as r", "r.report_id", "ra.report_id")
            .select(
                "ra.id",
                "ra.report_id",
                "ra.admin_id",
                "ra.action_type",
                "ra.memo",
                "ra.created_at",
                "r.reporter_id",
                "r.reported_id",
                "r.type",
                "r.post_id",
                "r.reason"
            )
            .orderBy("ra.created_at", "desc");
        if (reportId !== null) {
            query.where("ra.report_id", reportId);
        }
        const rows = await query;

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/report_evidence_snapshots">신고 증거 스냅샷 페이지로</a> <a href="/admin/audit_logs">어드민 감사 로그 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>신고 처리 내역${reportId !== null ? ` (신고번호 ${escapeHtml(reportId)})` : ""}</h1>
            ${reportId !== null ? `<a href="/admin/report_actions">전체 보기</a><br>` : ""}
            <table border="1">
            <tr>
                <td>처리번호</td>
                <td>신고번호</td>
                <td>신고자 id</td>
                <td>신고된 id</td>
                <td>게시물 유형</td>
                <td>게시물 id</td>
                <td>사유</td>
                <td>처리자(admin_id)</td>
                <td>조치</td>
                <td>메모</td>
                <td>처리일시</td>
            </tr>
        `;
        for (const row of rows) {
            data += `<tr>`;
            data += `<td>${escapeHtml(row.id)}</td>`;
            data += `<td><a href="/admin/report_actions?report_id=${escapeHtml(row.report_id)}">${escapeHtml(row.report_id)}</a></td>`;
            data += `<td>${escapeHtml(row.reporter_id)}</td>`;
            data += `<td>${escapeHtml(row.reported_id)}</td>`;
            data += `<td>${escapeHtml(row.type)}</td>`;
            data += `<td>${escapeHtml(row.post_id)}</td>`;
            data += `<td>${escapeHtml(row.reason)}</td>`;
            data += `<td>${row.admin_id === null ? "-" : escapeHtml(row.admin_id)}</td>`;
            data += `<td>${escapeHtml(row.action_type)}</td>`;
            data += `<td>${escapeHtml(row.memo)}</td>`;
            data += `<td>${row.created_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>`;
            data += `</tr>`;
        }
        data += `</table>`;
        admin_html("신고 처리 내역", data, res);
    } catch (error) {
        console.error("Error in report_actions_page function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

// report_evidence_snapshots 조회 화면.
// content_snapshot_raw는 신고 시점 콘텐츠 원문(개인정보 포함 가능)이라 이 페이지 전체를
// check_login으로 막아둔 것 외에는 별도 마스킹 없이 그대로 보여줌 — 관리자만 봐야 하는 데이터이므로
// sql/add_report_evidence_snapshots_table.sql의 "관리자 권한으로만 접근" 요구사항을 라우트 레벨에서 만족시킴.
// JSON 컬럼(content_snapshot_raw/masked/context_json)은 문자열 또는 이미 파싱된 객체로 들어올 수 있어 안전하게 처리.
function stringifySnapshotValue(value) {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

async function report_evidence_snapshots_page(req, res) {
    try {
        let reportId = null;
        if (req.query.report_id !== undefined) {
            reportId = parseInt(req.query.report_id, 10);
            if (isNaN(reportId) || reportId <= 0) {
                return res.end("<h1>잘못된 요청입니다.</h1>");
            }
        }

        const query = knex("report_evidence_snapshots as s")
            .join("report as r", "r.report_id", "s.report_id")
            .select(
                "s.id",
                "s.report_id",
                "s.moderation_case_id",
                "s.target_type",
                "s.target_subtype",
                "s.target_id",
                "s.content_snapshot_raw",
                "s.content_snapshot_masked",
                "s.visibility_status_snapshot",
                "s.hidden_by_report",
                "s.hidden_by_admin",
                "s.created_at",
                "r.reporter_id",
                "r.reported_id",
                "r.reason"
            )
            .orderBy("s.created_at", "desc");
        if (reportId !== null) {
            query.where("s.report_id", reportId);
        }
        const rows = await query;

        // 원문(content_snapshot_raw)이 포함된 민감 화면이라 조회 자체를 감사 로그에 남김.
        await logAdminAction({
            action: "view_report_evidence_snapshot",
            target_type: "report",
            target_id: reportId,
            detail: reportId === null ? "viewed all snapshots" : null,
        });

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/report_actions">신고 처리 내역 페이지로</a> <a href="/admin/audit_logs">어드민 감사 로그 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>신고 증거 스냅샷${reportId !== null ? ` (신고번호 ${escapeHtml(reportId)})` : ""}</h1>
            <p style="color:#b00">⚠️ 원문(raw)에는 신고 시점 콘텐츠가 그대로 들어있습니다. 관리자 외 공유/캡처에 주의하세요.</p>
            ${reportId !== null ? `<a href="/admin/report_evidence_snapshots">전체 보기</a><br>` : ""}
            <table border="1">
            <tr>
                <td>스냅샷id</td>
                <td>신고번호</td>
                <td>case id</td>
                <td>대상유형</td>
                <td>대상id</td>
                <td>신고자 id</td>
                <td>신고된 id</td>
                <td>사유</td>
                <td>신고시점 노출상태</td>
                <td>신고로 비노출</td>
                <td>관리자가 비노출</td>
                <td>원문(raw, 관리자 전용)</td>
                <td>마스킹본</td>
                <td>생성일시</td>
            </tr>
        `;
        for (const row of rows) {
            data += `<tr>`;
            data += `<td>${escapeHtml(row.id)}</td>`;
            data += `<td><a href="/admin/report_evidence_snapshots?report_id=${escapeHtml(row.report_id)}">${escapeHtml(row.report_id)}</a></td>`;
            data += `<td>${row.moderation_case_id === null ? "-" : escapeHtml(row.moderation_case_id)}</td>`;
            data += `<td>${escapeHtml(row.target_type)}${row.target_subtype ? " / " + escapeHtml(row.target_subtype) : ""}</td>`;
            data += `<td>${row.target_id === null ? "-" : escapeHtml(row.target_id)}</td>`;
            data += `<td>${escapeHtml(row.reporter_id)}</td>`;
            data += `<td>${escapeHtml(row.reported_id)}</td>`;
            data += `<td>${escapeHtml(row.reason)}</td>`;
            data += `<td>${escapeHtml(row.visibility_status_snapshot)}</td>`;
            data += `<td>${row.hidden_by_report ? "Y" : "N"}</td>`;
            data += `<td>${row.hidden_by_admin ? "Y" : "N"}</td>`;
            data += `<td><pre style="max-width:320px;white-space:pre-wrap;">${escapeHtml(stringifySnapshotValue(row.content_snapshot_raw))}</pre></td>`;
            data += `<td><pre style="max-width:320px;white-space:pre-wrap;">${escapeHtml(stringifySnapshotValue(row.content_snapshot_masked))}</pre></td>`;
            data += `<td>${row.created_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>`;
            data += `</tr>`;
        }
        data += `</table>`;
        admin_html("신고 증거 스냅샷", data, res);
    } catch (error) {
        console.error("Error in report_evidence_snapshots_page function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

// admin_audit_logs 조회 화면. target_type/target_id로 필터 가능, 최신 300건만 표시(전체 스캔 방지).
async function admin_audit_logs_page(req, res) {
    try {
        const targetType = req.query.target_type ? String(req.query.target_type).slice(0, 30) : null;
        const targetId = req.query.target_id !== undefined && req.query.target_id !== ""
            ? String(req.query.target_id).slice(0, 50)
            : null;

        const query = knex("admin_audit_logs")
            .select("id", "admin_id", "action", "target_type", "target_id", "detail", "created_at")
            .orderBy("created_at", "desc")
            .limit(300);
        if (targetType) {
            query.where("target_type", targetType);
        }
        if (targetId !== null) {
            query.where("target_id", targetId);
        }
        const rows = await query;

        let data = `
            <a href="/admin/logout">logout </a> <a href="/admin/member">회원관리 페이지로</a> <a href="/admin/post">글 현황 페이지로</a> <a href="/admin/setblock">신고 목록 페이지로</a> <a href="/admin/report_actions">신고 처리 내역 페이지로</a> <a href="/admin/report_evidence_snapshots">신고 증거 스냅샷 페이지로</a> <a href="/admin/first_activity">첫 글/첫 반응 시각 페이지로</a> <a href="/admin/session_count">일별 세션 횟수 페이지로</a> <a href="/admin/admin_message">어드민 메시지 페이지로</a> <a href="/admin/app_launch_count">앱 실행 횟수 페이지로</a><br>
            <h1>어드민 감사 로그 (최신 300건)</h1>
            <form method="get" action="/admin/audit_logs" style="margin-bottom:8px;">
                <input type="text" name="target_type" placeholder="target_type (예: report)" value="${escapeHtml(targetType || "")}"/>
                <input type="text" name="target_id" placeholder="target_id" value="${escapeHtml(targetId || "")}"/>
                <input type="submit" value="필터"/>
                <a href="/admin/audit_logs">초기화</a>
            </form>
            <table border="1">
            <tr>
                <td>id</td>
                <td>admin_id</td>
                <td>action</td>
                <td>target_type</td>
                <td>target_id</td>
                <td>detail</td>
                <td>일시</td>
            </tr>
        `;
        for (const row of rows) {
            data += `<tr>
                <td>${escapeHtml(row.id)}</td>
                <td>${row.admin_id === null ? "-" : escapeHtml(row.admin_id)}</td>
                <td>${escapeHtml(row.action)}</td>
                <td>${row.target_type === null ? "-" : escapeHtml(row.target_type)}</td>
                <td>${row.target_id === null ? "-" : escapeHtml(row.target_id)}</td>
                <td>${escapeHtml(row.detail)}</td>
                <td>${row.created_at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
            </tr>`;
        }
        data += `</table>`;
        admin_html("어드민 감사 로그", data, res);
    } catch (error) {
        console.error("Error in admin_audit_logs_page function:", error);
        res.end("<h1>서버에서 오류가 발생했습니다.</h1>");
    }
}

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

        await logAdminAction({
            action: "send_admin_message",
            target_type: "admin_message",
            target_id: group_id,
            detail: `title=${title}, target_count=${targetIds.length}`,
        });

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
router.post("/setblock/status", (req, res) => {
    check_login(update_report_status(req, res), req, res);
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
// 다른 라우트와 달리 인자를 먼저 평가해 호출하는 check_login(fn(), ...) 패턴을 쓰지 않음.
// 그 패턴은 fn()이 cookie 체크 전에 이미 실행돼버리는 기존 버그가 있어(추후 admin.js 개편 시 정리 예정),
// 신규 라우트에서는 반복하지 않고 cookie 체크를 먼저 한 뒤에만 핸들러를 호출함.
router.get("/report_actions", (req, res) => {
    if (!req.headers.cookie) {
        return res.redirect("/admin");
    }
    report_actions_page(req, res);
});
// content_snapshot_raw(신고 시점 원문)를 보여주는 민감한 화면이라 cookie 체크를 핸들러 호출보다
// 먼저 평가하는 패턴을 report_actions와 동일하게 사용 — check_login(fn(), ...) 패턴은 쓰지 않음.
router.get("/report_evidence_snapshots", (req, res) => {
    if (!req.headers.cookie) {
        return res.redirect("/admin");
    }
    report_evidence_snapshots_page(req, res);
});
router.get("/audit_logs", (req, res) => {
    if (!req.headers.cookie) {
        return res.redirect("/admin");
    }
    admin_audit_logs_page(req, res);
});
module.exports = router;
