const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id } = require("./general.js"); 

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// ===== Authorization 헤더에서 우리 id 뽑기 =====
async function getOurIdFromAuth(authHeader, res) {
  const ourid = await define_id(authHeader, res);
  if (res.headersSent) return null; // define_id가 에러 응답했으면 null 반환
  if (!ourid) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return ourid; // user.id (= profile.id)
}

// /Jam-Talk: 차단 사용자 글 제외
router.get("/Jam-Talk", async (req, res) => {
  try {
    const ourid = await getOurIdFromAuth(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const talk = await knex("talk")
      .whereNotIn("writer_id", function () {
        this.select("blocked_user_id")
          .from("block_list")
          .where("user_id", ourid);
      })
      .select("*");

    res.json(talk);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

// /Jin-Talk: 차단 사용자 글 제외
router.get("/Jin-Talk", async (req, res) => {
  try {
    const ourid = await getOurIdFromAuth(req.headers.authorization, res);
    if (!ourid) return;

    const think = await knex("think")
      .whereNotIn("writer_id", function () {
        this.select("blocked_user_id") // ← 통일
          .from("block_list")
          .where("user_id", ourid);
      })
      .select("*");

    res.json(think);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

module.exports = router;
