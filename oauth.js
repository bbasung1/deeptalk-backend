const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const knex = require("./knex.js");
const qs = require("querystring");
const fs = require('fs');
const mailer = require("nodemailer");
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
    id = await trx("user").insert(
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
});

router.delete("/account", async (req, res) => {
  ourid = await convert_our_id(req.body.id);
  const reason = req.body.reason;
  const time = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  try {
    knex('user').where("id", ourid).update({ deletetime: time, delete_reason: reason });
    res.json({ success: 1 });
  } catch (err) {
    console.log(err);
    res.status(500).json({ uccess: 0, err: err })
  }
});

router.post("/check_age", (req, res) => {
  let tmpdate = req.body.birthdate;
  if (!tmpdate) {
    return res.status(400).json({ err: 'birthday required' });
  }
  const birthdate = new Date(tmpdate);
  const today = new Date();
  const agediff = today.getFullYear() - birthdate.getFullYear();
  const agecheck = today.getMonth() > birthdate.getMonth || (today.getMonth() === birthdate.getMonth() && today.getDate() >= birthdate.getDate());
  const age = agecheck ? agediff : agediff - 1;
  const checkage = age >= 14;
  return res.status(200).json({ checkage });
})

router.post("/login", (req, res) => {
  console.log(req.headers.authorization);
  let tkn = req.headers.authorization.split("Bearer ")[1];
  let decodetoken = jwt.decode(tkn);
  console.log(decodetoken);
  let iss = decodetoken.iss;
  let sub = decodetoken.sub;
  if (iss == "https://kauth.kakao.com") {
    knex
      .select("kakao_access_code", "kakao_refresh_code", "kakao_id_token", "id", "deletetime")
      .from("user")
      .where("kakao_id", sub)
      .then((tokendata) => {
        console.log(tokendata);
        axios
          .post(
            "https://kauth.kakao.com/oauth/token",
            qs.stringify({
              grant_type: "refresh_token",
              client_id: process.env.CLIENT_ID,
              refresh_token: tokendata[0].kakao_refresh_code,
              client_secret: process.env.KAKAO_CLIENT_SECRET,
            }),
            {
              headers: {
                "Content-Type": `application/x-www-form-urlencoded`,
              },
            }
          )
          .then((newdata) => {
            let senddata = newdata.data;
            let insertdata = {
              kakao_access_code: senddata.access_token,
              kakao_id_token: senddata.id_token,
            };
            if (senddata.refresh_token) {
              insertdata.kakao_refresh_code = senddata.refresh_token;
            }
            senddata.willdelete = false;
            if (tokendata[0].deletetime != null) {
              senddata.willdelete = true;
            }
            delete senddata.token_type;
            delete senddata.expires_in;
            knex("user")
              .where("kakao_id", sub)
              .update(insertdata)
              .then(() => {
                res.json(senddata);
              });
          })
          .catch((err) => {
            console.log(err);
            res.json(err);
          });
      });
  } else if (iss == "https://appleid.apple.com") {
    knex
      .select("apple_access_code", "apple_refresh_code", "apple_id_token", "deletetime")
      .from("user")
      .where("apple_id", sub)
      .then((tokendata) => {
        axios
          .post(
            "https://appleid.apple.com/auth/token",
            qs.stringify({
              grant_type: "refresh_token",
              client_secret: createSignWithAppleSecret(),
              client_id: process.env.APPLE_CLIENT_ID,
              redirect_uri: process.env.APPLE_REDIRECT_URI,
              refresh_token: tokendata[0].apple_refresh_code,
            }),
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
            }
          )
          .then((newdata) => {
            let senddata = newdata.data;
            let insertdata = {
              apple_access_code: senddata.access_token,
              apple_id_token: senddata.id_token,
            };
            if (senddata.refresh_token) {
              insertdata.apple_refresh_code = senddata.refresh_token;
            }
            senddata.willdelete = false;
            if (tokendata[0].deletetime != null) {
              senddata.willdelete = true;
            }
            knex("user")
              .where("apple_id", sub)
              .update(insertdata)
              .then(() => {
                res.json(senddata);
              });
          })
          .catch((err) => {
            console.log(err);
            res.json(err);
          });
      });
  }
});

router.post("/cancel_delete", async (req, res) => {
  const ourid = await convert_our_id(req.body.id);
  knex('user').where("id", ourid).update({ deletetime: null, delete_reason: null }).then(() => {
    res.json({ success: 1 });
  }).catch((err) => {
    res.json({ success: 0, err: err });
  })

})

router.post("/mail_check", async (req, res) => {
  const mail_addr = req.body.mail_addr;
  const authnum = Math.random().toString().substr(2, 6);
  const transporter = mailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: "wbba1650@gmail.com",
      pass: process.env.GOOGLE_MAIL_PASSWORD,
    },
  });
  let mailOptions = transporter.sendMail({
    from: "test",
    to: mail_addr,
    subject: '딥톡 인증번호 도착!',
    text: `안녕하세요, 딥톡 운영자 진지입니다.\n
    따뜻하면서도 안전한 공간, 딥톡에 함께해 주셔서 감사해요.\n\n
    아래 인증번호를 입력해 주세요:\n[인증번호: ` + authnum + `]\n\n
    인증번호는 10분 동안 유효해요.\n\n
    딥톡 운영자 진지 드림`,
  });
  transporter.sendMail(mailOptions, function (error) {
    if (error) {
      console.log(error);
    }
    // console.log("Finish sending email : " + info.response);
    res.json({ authnum: authnum });
    transporter.close()
  });
});

module.exports = router;