const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id } = require("./general.js"); 

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// /Jam-Talk: 차단 사용자 글 제외
router.get("/Jam-Talk", async (req, res) => {
  try {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const talk = await knex("talk")
      .whereNotIn("writer_id", function () {
        this.select("blocked_user_id")
          .from("block_list")
          .where("user_id", ourid);
      })
      .whereNotIn("writer_id", function () {
        this.select("user_id")
          .from("block_list")
          .where("blocked_user_id", ourid)
          .andWhere("type", 0);
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
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const think = await knex("think")
      .whereNotIn("writer_id", function () {
        this.select("blocked_user_id")
          .from("block_list")
          .where("user_id", ourid);
      })
      .whereNotIn("writer_id", function () {
        this.select("user_id")
          .from("block_list")
          .where("blocked_user_id", ourid)
          .andWhere("type", 0);
      })
      .select("*");

    res.json(think);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

module.exports = router;
