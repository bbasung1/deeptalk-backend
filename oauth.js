const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
const axios = require("axios");
const jwt = require("jsonwebtoken");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));
dotenv.config();

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

  router.post("/kakao",(req,res)=>{
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
    .then((data1)=>{
      console.log(data1.data);
      let kkoidtkn = jwt.decode(data1.data.id_token);
      let access_token = data1.data.access_token;
      res.json(data1.data);
    })
  })
module.exports = router;