const express = require("express");
const router = express.Router();
const axios = require("axios");
const define_id = require("./general.js").define_id;

const knex = require("./knex.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.use("/block", require("./profile/block.js"));
router.use("/mute", require("./profile/mute.js"));
router.use("/image", require("./profile/image.js"));

router.post("/info", async (req, res) => {
  const user_id = req.body.user_id;
  const data = await knex("profile").select("*").where("user_id", user_id).first();
  delete data["servicealram"];
  delete data["useralram"];
  delete data["marketalram"];
  delete data["theme"];
  delete data["profile_image"]
  return res.json(data);
})

router.post("/alram", (req, res) => {
  let updatedata = {}
  if (req.body.service != null) {
    updatedata.servicealram = req.body.service;
  }
  if (req.body.user != null) {
    updatedata.useralram = req.body.user;
  }
  if (req.body.market != null) {
    updatedata.marketalram = req.body.market;
  }
  if (Object.keys(updatedata).length > 0) {
    knex("profile")
      .update(updatedata)
      .then(() => {
        res.status(200).json({
          success: 1
        })
      })
  } else {
    res.status(200).json({
      success: 0
    })
  }
})

router.put("/id", (req, res) => {
  knex("profile")
    .where("user_id", req.body.original_id)
    .update({ user_id: req.body.change_id })
    .then(() => {
      res.status(200).json({ success: 1 })
    })
    .catch((err) => {
      let errdata = {
        success: 0,
        errcode: err.errno,
        errmsg: "기타 오류가 발생했습니다."
      }
      if (err.errno == 1062) {
        errdata.errmsg = "아이디가 중복됩니다."
      }
      console.error(err)
      res.json(errdata)
    })
});

router.post("/id_check", async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "user_id를 입력해주세요."
    });
  }

  try {
    const exists = await knex("profile").where({ user_id }).first();

    if (exists) {
      res.json({
        success: true,
        duplicated: true,
        message: "이미 사용 중인 아이디입니다."
      });
    } else {
      res.json({
        success: true,
        duplicated: false,
        message: "사용 가능한 아이디입니다."
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다."
    });
  }
});


router.post("/nickname/register", async (req, res) => {
  const { user_id, nickname } = req.body;

  if (!user_id || !nickname) {
    return res.status(400).json({ message: "user_id와 nickname을 입력하시오" });
  }

  try {
    const updated = await knex("profile")
      .where("user_id", user_id)
      .update({ nickname });

    if (updated === 0) {
      return res.status(404).json({ message: "Profile not found." });
    }

    res.status(200).json({ message: "닉네임 업데이트 성공" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "닉네임 업데이트 실패" });
  }
});



router.post("/nickname", async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: "user_id가 필요합니다." });
  }

  try {
    const result = await knex("profile")
      .select("nickname")
      .where("user_id", user_id)
      .first(); // 결과 하나만 받을 거니까 .first()로 간결하게 작성함.

    if (!result) {
      return res.status(404).json({ message: "없는 user_id " });
    }

    res.status(200).json({
      user_id: user_id,
      nickname: result.nickname
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "닉네임 조회 실패"
    });
  }
});


// const TYPE_BLOCK = 0;
// const TYPE_MUTE = 1;
// const TYPE_REPORT = 2;

// const typeMap = {
//   "block": TYPE_BLOCK,
//   "mute": TYPE_MUTE,
//   "report": TYPE_REPORT,
// };

// 테마 설정
router.post("/theme", async (req, res) => {
  const { user_id, theme } = req.body;

  // 입력값 유효성 검사
  if (!user_id || theme === undefined) {
    return res.status(400).json({
      success: false,
      message: "user_id와 theme 값이 필요합니다."
    });
  }

  try {
    const updated = await knex("profile")
      .where({ user_id })
      .update({ theme });

    if (updated === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 user_id에 대한 profile이 존재하지 않습니다."
      });
    }

    res.status(200).json({
      success: true,
      message: "테마 업데이트 완료",
      theme: theme
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "서버 오류"
    });
  }
});

router.put("/mail", async (req, res) => {
  const id = await define_id(req.headers.authorization, res);
  console.log(id);
  if (id == null) {
    return res.status(403).json({
      success: 0,
      msg: "변경 권한이 없습니다",
    })
  }
  try {
    const tmp = await knex("user").update({ email: req.body.mail }).where("id", id);
    return res.json({ success: 1 });
  } catch {
    return res.status(500).json({ success: 0, msg: "메일 변경 실패" })
  }
});

router.get("/account_info", async (req, res) => {
  const id = await define_id(req.headers.authorization, res);
  const [info] = await knex("user").select("user.email", "profile.user_id", "profile.nickname").leftJoin("profile", "user.id", "profile.id").where("user.id", id);
  console.log(info);
  res.json(info);
});

module.exports = router;

