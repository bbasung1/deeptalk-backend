const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const knex = require("./knex.js");
const qs = require("querystring");
const fs = require('fs');
const convert_our_id = require('./general.js').convert_our_id;

router.use(express.json());
router.use(express.urlencoded({ extended: true }));
dotenv.config();

router.get("/test1/kakao", async (req, res) => {
  const trx = await knex.transaction();
  test = await trx("user").insert({ twitter_id: 123123, email: "bbasung@test.com" })
  console.log(test);
  await trx("profile").insert({ id: test, user_id: "test" });
  await trx.commit();
});

router.get("/test/kakao", (req, res) => {
  res.redirect(
    process.env.KAKAO_AUTH_URL +
    process.env.CLIENT_ID +
    "&redirect_uri=" +
    process.env.REDIRECT_URI +
    "&scope=openid&response_type=code"
  );
});

router.get("/kakao", (req, res) => {
  let code = req.query.code;
  res.json({
    success: 1,
    code: code
  });
});

router.post("/kakao", (req, res) => {
  let code = req.body.code;
  console.log(code);
  axios
    .post(
      "https://kauth.kakao.com/oauth/token",
      {},
      {
        headers: {
          "Content-Type": `application/x-www-form-urlencoded`,
        },
        params: {
          grant_type: "authorization_code",
          client_id: process.env.CLIENT_ID,
          redirect_uri: process.env.REDIRECT_URI,
          code: code,
          client_secret: process.env.KAKAO_CLIENT_SECRET,
        },
      }
    )
    .then((data1) => {
      console.log(data1.data);
      let kkoidtkn = jwt.decode(data1.data.id_token);
      let access_token = data1.data.access_token;
      knex.select("*").from("user").where("kakao_id", kkoidtkn.sub).then((userdata) => {
        if (userdata) {
          data1.data.registerd = 1;
        } else {
          data1.data.registerd = 0;
        }
        res.json(data1.data);
      });
    })
})

router.get("/apple", (req, res) => {
  console.log("test");
  const config = {
    client_id: process.env.APPLE_CLIENT_ID,
    redirect_uri: process.env.APPLE_LOGIN_REDIRECT_URL,
    response_type: "code id_token",
    state: "origin:web",
    scope: "name email",
    response_mode: "form_post",
    m: 11,
    v: "1.5.4",
  };
  const queryString =
    `https://appleid.apple.com/auth/authorize?` +
    Object.entries(config)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");
  console.log(queryString);
  res.redirect(queryString);
});
const createSignWithAppleSecret = () => {
  const signWithApplePrivateKey = fs.readFileSync('/root/AuthKey_QBCF42TSA9.p8')
  console.log(signWithApplePrivateKey)
  const token = jwt.sign({}, signWithApplePrivateKey, {
    algorithm: "ES256",
    expiresIn: "1h",
    audience: "https://appleid.apple.com",
    issuer: process.env.APPLE_TEAM_ID, // TEAM_ID
    subject: process.env.APPLE_CLIENT_ID, // Service ID
    keyid: process.env.APPLE_KEY_ID, // KEY_ID
  });
  return token;
};

router.post("/callback/apple", (req, res) => {
  let appleidtoken = req.body.id_token;
  let idtwk = jwt.decode(appleidtoken);
  let applesub = idtwk.sub;
  let applecode = req.body.code;
  let ci = req.body.ci;
  axios
    .post(
      "https://appleid.apple.com/auth/token",
      qs.stringify({
        grant_type: "authorization_code",
        code: applecode,
        client_secret: createSignWithAppleSecret(),
        client_id: process.env.APPLE_CLIENT_ID,
        redirect_uri: process.env.APPLE_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    )
    .then((data1) => {
      let resinfo = data1.data;
      console.log(resinfo);
      res.json(resinfo);
    });
});


router.put("/signup", async (req, res) => {
  let tkn = req.body.jwt_token;
  let decodetoken = jwt.decode(tkn);
  let iss = decodetoken.iss;
  const trx = await knex.transaction();
  // knex.transaction((trx) => {
  let kakaoid = null;
  let kakaoAccessCode = null;
  let kakaoRefreshCode = null;
  let kakaoIdToken = null;
  let appleAccessCode = null;
  let appleRefreshCode = null;
  let appleIdToken = null;
  if (iss == "https://kauth.kakao.com") {
    kakaoAccessCode = req.body.access_token;
    kakaoRefreshCode = req.body.refresh_token;
    kakaoIdToken = tkn;
    kakaoid = decodetoken.sub;
  }
  if (iss == "https://appleid.apple.com") {
    appleAccessCode = req.body.access_token;
    appleRefreshCode = req.body.refresh_token;
    appleIdToken = tkn;
  }
  try {
    id = trx("user").insert(
      {
        kakao_access_code: kakaoAccessCode,
        kakao_refresh_code: kakaoRefreshCode,
        kakao_id_token: kakaoIdToken,
        apple_access_code: appleAccessCode,
        apple_refresh_code: appleRefreshCode,
        apple_id_token: appleIdToken,
        kakao_id: kakaoid,
        email: req.body.email
      }
    );
    await trx("profile").insert({ id: id, user_id: req.body.user_id, nickname: req.body.nickname });
    await trx.commit();
    console.log("complete");
    res.status(200).json({ success: 1 });
  } catch (err) {
    await trx.rollback();
    console.error(err);
    res.status(500).json({ success: 0 });
  }
  // .into("user")
  // // .then((ids) => {
  // //   return trx
  // //     .insert({
  // //       id: ids[0],
  // //       nickname: req.body.name,
  // //       profile_image: req.body.profileImage,
  // //     })
  // //     .into("profile")
  // //     .then(() => {
  // //       let friends = req.body.friends;
  // //       if (friends.length > maxFriends) {
  // //         throw new Error("You have reached the maximum number of friends");
  // //       }
  // //       friends.forEach((friend) => {
  // //         friend.user_id = ids[0];
  // //       });
  // //       return trx.insert(friends).into("friend_list");
  // //     });
  // // })
  // .then(() => {
  //   res.json({ success: 1 });
  // })
  // .catch((err) => {
  //   res.json({ success: 0, error: err });
  // });
  // });
});

router.delete("/account", async (req, res) => {
  ourid = await convert_our_id(req.body.id);
  const trx = await knex.transaction();
  try {
    await Promise.all([
      trx("block_list").where("user_id", ourid).del(),
      trx("comment").where("user_id", ourid).del(),
      trx("talk").where("writer_id", ourid).del(),
      trx("think").where("writer_id", ourid).del(),
      trx("talk").where("writer_id", ourid).del(),
    ]);
    await trx("profile").where("id", ourid).del();
    await trx("user").where("id", ourid).del();

    await trx.commit();
    console.log("complete");
    res.status(200).json({ success: 1 });
  } catch (err) {
    await trx.rollback();
    console.error(err);
    res.status(500).json({ success: 0 });
  }
});

module.exports = router;