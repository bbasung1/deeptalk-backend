const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id,user_id_to_id } = require("./general.js");

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
  morgan(
    "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
    { stream: stream }
  )
);

/**
 * 📌 신고 생성 API
 * POST /report
 *
 * 요청 body 예시:
 * {
 *   "post_id": 12,
 *   "post_type": "think",
 *   "report_type": "욕설",
 *   "reason": "상대방이 모욕적인 말을 했어요."
 * }
 */

router.post("/", async (req, res) => {
  try {
    // 1️⃣ 토큰에서 reporter_id 추출
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const reporter_id = ourid;

    // 2️⃣ 요청 body 검증
    const { post_id, post_type, report_type, reason, category } = req.body;
    if (!category || !report_type) {
      return res.status(400).json({ success: 0, msg: "필수 항목이 누락되었습니다." });
    }

    if (!["think", "talk", "comment","user"].includes(post_type)) {
      return res.status(400).json({ success: 0, msg: "유효하지 않은 post_type 값입니다." });
    }

    // 3️⃣ 신고 대상 게시글 작성자 찾기
    let reportedUser;
    if (post_type === "think") {
      reportedUser = await knex("think").where("think_num", post_id).select("writer_id").first();
    } else if (post_type == "talk") {
      reportedUser = await knex("talk").where("talk_num", post_id).select("writer_id").first();
    } else if (post_type == "comment") {
      reportedUser = await knex("comment").where("comment_num", post_id).select("writer_id").first();
    } else if(post_type=="user"){
      post_id = await user_id_to_id(post_id);
      if(!post_id){
        return res.status(404).json({ success: 0, msg: "해당 사용자를 찾을 수 없습니다." });
      }
      reportedUser = await knex("profile").where("id", post_id).select("id as writer_id").first();
    }

    if (!reportedUser && category == "report") {
      return res.status(404).json({ success: 0, msg: "해당 게시글을 찾을 수 없습니다." });
    }

    const reported_id = reportedUser.writer_id;

    // 4️⃣ 중복 신고 방지 (reporter_id + post_id + post_type)
    const duplicate = await knex("report")
      .where({ reporter_id, post_id, post_type })
      .first();

    if (duplicate) {
      return res.status(409).json({ success: 0, msg: "이미 신고한 게시글입니다." });
    }

    // 5️⃣ 신고 DB 저장
    await knex("report").insert({
      reporter_id,
      reported_id,
      post_id,
      post_type,
      report_type,
      reason,
      category
    });

    return res.status(201).json({ success: 1, msg: "신고가 접수되었습니다." });
  } catch (err) {
    console.error("🚨 신고 처리 중 오류:", err);
    res.status(500).json({ success: 0, msg: "서버 내부 오류", err: err.message });
  }
});

module.exports = router;
