// 어드민 인증 공용 로직. admin.js(레거시 쿠키 기반 HTML 화면)와 admin_api.js(신규 JSON API,
// React 프론트엔드용 Authorization 헤더 기반)가 이 모듈을 공유한다.
//
// SYS-001 요구사항("자동 로그아웃 없음 — 운영 편의")에 따라 로그인 시 발급하는 JWT에는
// exp를 넣지 않는다. 그 대신 로그아웃 시 폐기할 수 있도록 admin_sessions 테이블에
// jti(세션 id)를 기록해두고 매 요청마다 폐기 여부를 함께 확인한다(sql/add_admin_sessions_table.sql).
const jwt = require("jsonwebtoken");
const knex = require("../knex.js");

const ADMIN_COOKIE_NAME = "admin_token";
const ADMIN_JWT_ISSUER = "jamdeeptalk.com";

function getTokenFromCookie(req) {
    if (!req.headers.cookie) return null;
    const match = req.headers.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${ADMIN_COOKIE_NAME}=`));
    if (!match) return null;
    return match.slice(`${ADMIN_COOKIE_NAME}=`.length);
}

function getTokenFromAuthHeader(req) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return null;
    return header.slice("Bearer ".length);
}

// JWT 서명 검증 + admin_sessions 폐기 여부 + 계정 활성 상태를 확인한다.
// 통과 시 { id, email, name }을 반환, 실패 시 null.
async function verifyAdminToken(token) {
    if (!token) return null;
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, { issuer: ADMIN_JWT_ISSUER });
    } catch (err) {
        return null;
    }
    if (!decoded || decoded.jti == null || decoded.sub == null) return null;
    const session = await knex("admin_sessions")
        .where({ id: decoded.jti, admin_id: decoded.sub })
        .whereNull("revoked_at")
        .first();
    if (!session) return null;
    const admin = await knex("admins").where({ id: decoded.sub, is_active: 1 }).first();
    if (!admin) return null;
    return { id: admin.id, email: admin.email, name: admin.name };
}

async function authenticateAdminFromCookie(req) {
    return verifyAdminToken(getTokenFromCookie(req));
}

async function authenticateAdminFromHeader(req) {
    return verifyAdminToken(getTokenFromAuthHeader(req));
}

// admin.js(HTML)용 — 실패 시 로그인 페이지로 리다이렉트.
function requireAdmin(handler) {
    return async (req, res) => {
        const admin = await authenticateAdminFromCookie(req);
        if (!admin) return res.redirect("/admin");
        req.admin = admin;
        return handler(req, res);
    };
}

// admin_api.js(JSON)용 — 실패 시 401 JSON 응답.
function requireAdminApi(handler) {
    return async (req, res) => {
        const admin = await authenticateAdminFromHeader(req);
        if (!admin) return res.status(401).json({ success: 0, msg: "인증이 필요합니다." });
        req.admin = admin;
        return handler(req, res);
    };
}

// 로그인 성공 시 세션 생성 + JWT 발급을 담당하는 공용 로직.
// admin.js(쿠키 로그인)와 admin_api.js(Bearer 로그인) 양쪽에서 재사용한다.
async function issueAdminSession(admin) {
    const [sessionId] = await knex("admin_sessions").insert({ admin_id: admin.id });
    const token = jwt.sign(
        { sub: admin.id, email: admin.email, jti: sessionId },
        process.env.JWT_SECRET,
        { issuer: ADMIN_JWT_ISSUER }
    );
    return token;
}

async function revokeAdminToken(token) {
    if (!token) return;
    const decoded = jwt.decode(token);
    if (decoded && decoded.jti != null) {
        await knex("admin_sessions").where({ id: decoded.jti }).update({ revoked_at: knex.fn.now() });
    }
}

module.exports = {
    ADMIN_COOKIE_NAME,
    ADMIN_JWT_ISSUER,
    getTokenFromCookie,
    getTokenFromAuthHeader,
    verifyAdminToken,
    authenticateAdminFromCookie,
    authenticateAdminFromHeader,
    requireAdmin,
    requireAdminApi,
    issueAdminSession,
    revokeAdminToken,
};
