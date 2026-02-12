const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const knex = require("./knex.js");
const qs = require("querystring");
const fs = require('fs');
const mailer = require("nodemailer");
const { decode } = require("punycode");
const { define_id, tmp_convert_our_id, make_code } = require('./general.js')
const MEMBER_COUNT = 99999;
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
dotenv.config();

router.get("/test1", async (req, res) => {
  test = await knex("user").whereNull("deletetime").count({ "test": "*" });
  if (MEMBER_COUNT < test[0].test) {
    return res.status(500).json({ success: 0, err_code: 5001, msg: "멤버가 최대치에 도달했습니다!" });
  }
  res.send(test[0]);
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
  axios
    .post(
      "https://appleid.apple.com/auth/token",
      qs.stringify({
        grant_type: "authorization_code",
        code: applecode,
        client_secret: createSignWithAppleSecret(),
        client_id: process.env.APPLE_CLIENT_ID,
        redirect_uri: process.env.APPLE_LOGIN_REDIRECT_URI,
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

router.get("/callback/discord", async (req, res) => {
  const code = req.query.code
  // res.json({ code });
  try {
    const test = await axios
      .post(
        'https://discord.com/api/oauth2/token',
        qs.stringify({
          client_id: process.env.DISCORD_CLIENT_ID.replace(/['",]/g, ''),
          client_secret: process.env.DISCORD_CLIENT_SECRET.replace(/['",]/g, ''),
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.DISCORD_REDIRECT_URI.replace(/['",]/g, ''),
          scope: 'identify email'
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
    const access_token = test.data.access_token;
    console.log(test.data);
    // res.json({ success: 1, access_token });
    const userdata = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        authorization: `Bearer ${access_token}`,
      },
    });
    console.log(userdata.data);
    const token = jwt.sign({ refresh_token: test.data.refresh_token, email: userdata.data.email, sub: userdata.data.id, is_discord: 1, access_token }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' });
    res.json({ success: 1, token })
  } catch (err) {
    res.json({ success: 0, err });
  }
})

router.get("/google", async (req, res) => {
  const app_url = req.query.redirect_uri;
  const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  const client_id = process.env.GOOGLE_CLIENT_ID.replace(/['",]/g, '');
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI.replace(/['",]/g, '');
  const scope = "openid email profile";
  const response_type = "code";
  const params = new URLSearchParams({
    client_id, redirect_uri, scope, response_type, access_type: 'offline', prompt: 'consent', state: app_url
  })
  authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  console.log(authUrl);
  res.redirect(authUrl);
});

router.get("/callback/google", async (req, res) => {
  const { code, state } = req.query
  const tokenres = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID.replace(/['",]/g, ''),
    client_secret: process.env.GOOGLE_CLIENT_SECRET.replace(/['",]/g, ''),
    redirect_uri: process.env.GOOGLE_REDIRECT_URI.replace(/['",]/g, ''),
    grant_type: 'authorization_code'
  });
  console.log(tokenres.data);
  const { access_token, id_token, refresh_token } = tokenres.data;
  const params = new URLSearchParams({
    access_token, id_token, refresh_token
  });
  redirectUrl = `${state}?${params.toString()}`;
  console.log(redirectUrl);
  res.redirect(redirectUrl);
  // res.json({ access_token, id_token });
})

router.put("/signup", async (req, res) => {
  console.log("signup");
  console.log(req.body);
  let tkn = req.body.jwt_token;
  let decodetoken = jwt.decode(tkn);
  console.log(decodetoken);
  let iss = decodetoken.iss;
  const trx = await knex.transaction();
  // const member = await knex("user").whereNull("deletetime").count({ "member": "*" });
  // if (MEMBER_COUNT < member[0].member) {
  //   return res.status(500).json({ success: 0, err_code: 5001, msg: "멤버가 최대치에 도달했습니다!" });
  // }
  let kakaoid = null;
  let kakaoAccessCode = null;
  let kakaoRefreshCode = null;
  let kakaoIdToken = null;
  let appleAccessCode = null;
  let appleRefreshCode = null;
  let appleIdToken = null;
  let discord_id = null;
  let discord_access_code = null;
  let discord_refresh_code = null;
  let google_id = null;
  let google_access_code = null;
  let google_id_token = null;
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
  if (iss == "jamdeeptalk.com" && decodetoken.is_discord != undefined) {
    discord_id = decodetoken.sub
    discord_access_code = decodetoken.access_token
    discord_refresh_code = decodetoken.refresh_token
    // return res.json({ discord_refresh_code });
  }
  if (iss == "https://accounts.google.com") {
    google_id = decodetoken.sub;
    google_access_code = req.body.access_token;
    google_id_token = tkn;
    google_refresh_code = req.body.refresh_token;
  }
  try {
    [id] = await trx("user").insert(
      {
        kakao_access_code: kakaoAccessCode,
        kakao_refresh_code: kakaoRefreshCode,
        kakao_id_token: kakaoIdToken,
        apple_access_code: appleAccessCode,
        apple_refresh_code: appleRefreshCode,
        apple_id_token: appleIdToken,
        kakao_id: kakaoid,
        discord_id,
        discord_access_code,
        discord_refresh_code,
        google_id,
        google_access_code,
        google_id_token,
        email: req.body.email
      }
    );
    const token = jwt.sign({ email: req.body.email, sub: id }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' });
    await trx("user").update({ our_jwt: token }).where("id", id);
    await trx("profile").insert({ id: id, user_id: req.body.user_id, nickname: req.body.nickname });
    await trx.commit();
    console.log("complete");
    res.status(200).json({ success: 1, token });
  } catch (err) {
    await trx.rollback();
    console.error(err);
    res.status(500).json({ success: 0 });
  }
});

router.delete("/account", async (req, res) => {
  ourid = await define_id(req.headers.authorization, res);
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

router.post("/login", async (req, res) => {
  console.log("login");
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
  } else if (iss == "jamdeeptalk.com") {
    let sub = decodetoken.sub
    if (decodetoken.is_discord != undefined) {
      const [id] = await knex("user").select("id").where("discord_id", decodetoken.sub);
      console.log(id.id);
      sub = id.id;
    }
    const token = jwt.sign({ email: decodetoken.email, sub: sub }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' });
    await knex("user").update({ our_jwt: token }).where("id", sub)
    res.json({ id_token: token });
  } else if (iss == "https://accounts.google.com") {
    const [id] = await knex.select("google_access_code", "google_refresh_code", "id").from("user").where("google_id", sub);
    console.log();
    if (id == undefined) {
      return res.json({ success: 0, msg: "not sign up" })
    }
    const token = jwt.sign({ email: decodetoken.email, sub: id.id }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' });
    return res.json({ id_token: token });
  }
});

router.post("/cancel_delete", async (req, res) => {
  const ourid = await tmp_convert_our_id(req.headers.authorization);
  const reason_delete = await knex('delete_reason').where("id", ourid).del();
  knex('user').where("id", ourid).update({ deletetime: null, delete_reason: null }).then(() => {
    res.json({ success: 1 });
  }).catch((err) => {
    res.json({ success: 0, err: err });
  })

})

router.get("/member_check", async (req, res) => {
  console.log("member_check");
  const token = req.headers.authorization.split("Bearer ")[1]
  console.log("token")
  console.log(token);
  const tokendata = jwt.decode(token);
  console.log(tokendata)
  const iss = tokendata.iss;
  const sub = tokendata.sub;
  let type = "";
  if (iss == "https://kauth.kakao.com") {
    type = "kakao"
  } else if (iss == "https://appleid.apple.com") {
    type = "apple"
  } else if (iss == "https://accounts.google.com") {
    type = "google"
  } else if (iss == "jamdeeptalk.com" && tokendata.is_discord) {
    console.log("discord");
    console.log(tokendata);
    type = "discord"
  } else if (iss == "jamdeeptalk.com") {
    console.log("jamdeeptalk");
    console.log(tokendata);
    return res.json({ is_member: 1, jwt: jwt.sign({ email: tokendata.email, sub: sub }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' }) })
  } else {
    return res.json({ is_member: 0 });
  }
  const [id] = await knex("user").select("id").where(`${type}_id`, sub);
  console.log(id)
  let data = { is_member: 0 }
  if (id != undefined) {
    data.is_member = 1
    data.jwt = jwt.sign({ email: tokendata.email, sub: id }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' });
  }
  console.log(data);
  res.json(data);
});

router.post("/mail_check", async (req, res) => {
  const mail_addr = req.body.mail_addr;
  const [check_mail] = await knex("user").select("id").where("email", mail_addr);
  console.log(check_mail);
  if (check_mail != null) {
    return res.status(401).json({ msg: "이미 메일값이 존재합니다" });
  }
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
    subject: '✉️ 딥톡 인증번호가 도착했습니다',
    text: `본인 확인을 위한 인증번호 전달드립니다.\n\n

다른 사람에게 들키지 않고, 아래의 인증번호를 정확히 진지에게만 전달해 주세요.\n\n

[인증번호: ${authnum}]\n\n

해당 인증번호의 효력은 10분 동안만 유지됩니다.
만약 본인이 요청하지 않은 인증이라면 이 메일을 무시해 주세요.\n\n

도움이 필요할 경우 아래 고객센터로 문의해 주세요.
deeptalk2026@gmail.com`,
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

router.get("/remain_people", async (req, res) => {
  let [test] = await knex("user").whereNull("deletetime").count({ "cur_member": "*" });
  test.max_member = MEMBER_COUNT;
  console.log(test);
  res.json(test);
});

router.get("/jwttest", async (req, res) => {
  const token = jwt.sign({ email: "bbasung@kakao.com", sub: 1, }, process.env.JWT_SECRET, { expiresIn: '24h', issuer: 'jamdeeptalk.com' });
  res.json({ token });
});

router.get("/bearertest", async (req, res) => {
  const ourid = await tmp_convert_our_id(req.headers.authorization);
  if (ourid.code != undefined) {
    const { httpcode, ...rest } = ourid;
    console.log(httpcode);
    console.log(rest);
    return res.status(httpcode).json(rest);
  }
  res.json({ ourid });
});

router.post("/duple_mail_check", async (req, res) => {
  const target_mail = req.body.mail;
  const [mail] = await knex("user").select("email").where("email", target_mail);
  let senddata = { duple: 1 };
  if (mail == undefined) {
    senddata.duple = 0;
  }
  res.json(senddata);
});

router.post("/passwd", async (req, res) => {
  const passwd = req.body.passwd;
  const trx = await knex.transaction();
  const [vaild] = await knex("passwd").select("passwd", "change", "vaild_date").where("passwd", passwd);
  console.log(vaild)
  try {
    if (vaild == undefined) {
      console.log("unvaild");
      return res.json({ success: 0, msg: "잘못된 암호입니다." })
    }
    if (vaild.change) {
      console.log("change");
      const code = make_code(5);
      console.log(code)
      await trx("passwd").update({ passwd: make_code(5) }).where("passwd", passwd);
      trx.commit()
    }
    return res.json({ success: 1, msg: "인증 완료" })
  } catch {
    trx.rollback();
    return res.json({ success: 0, msg: "오류발생" })
  }
});

module.exports = router;