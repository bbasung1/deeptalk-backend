const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const define_id = require("./general.js").define_id;

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get("/:id", async (req, res) => {
  try {
    // 1) 파라미터 검증
    const talkNum = Number(req.params.id);
    if (!Number.isInteger(talkNum) || talkNum < 1) {
      return res.status(400).json({ error: "잘못된 글 번호입니다." });
    }

    // 2) 인증 처리 (선택적 로그인)
    const authHeader = req.headers.authorization;
    let ourId = null;
    if (authHeader) {
      ourId = await define_id(authHeader, res);
      if (res.headersSent) return; // define_id에서 이미 에러 응답한 경우 종료
    }

    // 3) 쿼리 빌드
    const q = knex("talk").where("talk_num", talkNum);

    // 로그인 사용자만 차단목록 필터 적용
    if (ourId !== null && ourId !== undefined) {
      q.whereNotIn("writer_id", function () {
        this.select("blocked_user_id")
          .from("block_list")
          .where("user_id", ourId);
      });
    }

    // 4) 단일 행 조회
    const talk = await q.first("*");

    // 5) 결과/에러 응답
    if (!talk) {
      return res.status(404).json({ msg: "없거나 비공개인 포스트 입니다" });
    }
    return res.json(talk);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "서버오류발생" });
  }
});

module.exports = router;
