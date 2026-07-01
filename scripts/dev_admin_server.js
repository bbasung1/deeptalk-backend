#!/usr/bin/env node
// deeptalk-admin-web(React) 로컬 개발 전용 백엔드 서버.
//
// 프로덕션 deeptalk.js는 9300번 포트를 jamdeeptalk.com용 HTTPS(인증서: CA/KEY/CERT)로 띄우고
// pm2가 관리하며 실제 유저 트래픽을 받는다. 그 프로세스를 로컬 프론트엔드 개발 중에 만지거나
// 재시작하면 실제 서비스가 끊긴다 — 그래서 어드민(admin.js/admin_api.js)만 별도로, 평문 HTTP로,
// 다른 포트에 띄우는 전용 스크립트를 분리했다. cron/FCM 등 다른 라우트는 로드하지 않는다
// (실수로 실제 유저에게 푸시가 나가는 등의 부작용을 피하기 위함).
//
// 사용법: node scripts/dev_admin_server.js [포트, 기본 9301]
// deeptalk-admin-web의 .env는 이 포트를 가리키도록 설정한다.
// 예: VITE_API_BASE_URL=http://<이 기기의 LAN IP>:9301/admin/api

const express = require("express");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/admin", require("../admin.js"));
app.use("/admin/api", require("../admin_api.js"));

const port = parseInt(process.argv[2], 10) || 9301;
app.listen(port, "0.0.0.0", () => {
    console.log(`[dev_admin_server] 어드민 전용 개발 서버 — http://0.0.0.0:${port} (프로덕션 9300과 무관)`);
});
