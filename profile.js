const express = require("express");
const router = express.Router();
const axios = require("axios");
const { define_id, user_id_to_id } = require("./general.js");

const knex = require("./knex.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
  morgan(
    "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
    { stream: stream }
  )
);

router.use("/block", require("./profile/block.js"));
router.use("/mute", require("./profile/mute.js"));
router.use("/image", require("./profile/image.js"));
router.use("/status_msg", require("./profile/status_msg.js"));

router.post("/info", async (req, res) => {
  const user_id = req.body.user_id;
  const our_id=await user_id_to_id(user_id);
  let requester_id = null;
  if (req.headers.authorization) {
    requester_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
  }

  const data = await knex("profile").select("*").where("user_id", user_id).first();
  if (!data) {
    return res.status(404).json({ msg: "user_id를 찾을수 없습니다." })
  }
  console.log(requester_id);
  console.log(req.body.user_id);
  if (requester_id) {
    const blocked = await knex("block_list")
      .where(function () {
        this.where({ user_id: data.id, blocked_user_id: requester_id, type: 0 })
            .orWhere({ user_id: requester_id, blocked_user_id: data.id, type: 0 });
      })
      .first();
    if (blocked) {
      return res.status(403).json({ msg: "프로필을 조회할 수 없습니다.", code: "4031" });
    }
  }

  // 본인이 조회하는 경우에는 비공개 설정과 무관하게 항상 정확한 수치를 보여줍니다.
  const isOwner = requester_id != null && Number(requester_id) === Number(data.id);

  // DB(TINYINT)에서 0/1로 내려오므로 응답에서는 명확한 boolean으로 변환합니다.
  data.hide_follow_list = Boolean(data.hide_follow_list);

  if (data.hide_follow_list && !isOwner) {
    // 비공개 설정 시 숫자도 노출하지 않습니다 (목록 조회 API와 동일한 정책).
    data.follow_count = null;
    data.follower_count = null;
  } else {
    const [[{ follow_count }], [{ follower_count }]] = await Promise.all([
      knex("follow").where("user_id", data.id).count({ follow_count: "*" }),
      knex("follow").where("friend_id", data.id).count({ follower_count: "*" }),
    ]);
    data.follow_count = Number(follow_count);
    data.follower_count = Number(follower_count);
  }

  delete data["servicealram"];
  delete data["useralram"];
  delete data["marketalram"];
  delete data["theme"];
  delete data["profile_image"]
  return res.json(data);
})

router.post("/alram", async(req, res) => {
  let user_id = await user_id_to_id(req.body.id);
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
      .where("user_id", req.body.id)
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

router.put("/id", async (req, res) => {
  const id = await define_id(req.headers.authorization, res);
  if (res.headersSent) return;
  if (!id) return res.status(401).json({ success: 0, errmsg: "인증이 필요합니다." });

  knex("profile")
    .where("id", id)
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
  const id = await define_id(req.headers.authorization, res);
  if (res.headersSent) return;
  if (!id) return res.status(401).json({ message: "인증이 필요합니다." });

  const { nickname } = req.body;

  if (!nickname) {
    return res.status(400).json({ message: "nickname을 입력하시오" });
  }

  try {
    const updated = await knex("profile")
      .where("id", id)
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
  const id = await define_id(req.headers.authorization, res);
  if (res.headersSent) return;
  if (!id) return res.status(401).json({ success: false, message: "인증이 필요합니다." });

  const { theme } = req.body;

  if (theme === undefined) {
    return res.status(400).json({
      success: false,
      message: "theme 값이 필요합니다."
    });
  }

  try {
    const updated = await knex("profile")
      .where({ id })
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

// 팔로우/팔로잉 목록(개수) 비공개 설정
router.post("/hide_follow_list", async (req, res) => {
  const id = await define_id(req.headers.authorization, res);
  if (res.headersSent) return;
  if (!id) return res.status(401).json({ success: false, message: "인증이 필요합니다." });

  if (typeof req.body.hide === "undefined") {
    return res.status(400).json({
      success: false,
      message: "hide 값이 필요합니다."
    });
  }
  const hide = (req.body.hide === true || req.body.hide === 1 || req.body.hide === "1") ? 1 : 0;

  try {
    const updated = await knex("profile")
      .where({ id })
      .update({ hide_follow_list: hide });

    if (updated === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 user_id에 대한 profile이 존재하지 않습니다."
      });
    }

    res.status(200).json({
      success: true,
      message: hide ? "팔로우/팔로워 목록을 비공개로 설정했습니다." : "팔로우/팔로워 목록 비공개를 해제했습니다.",
      hide_follow_list: Boolean(hide)
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

