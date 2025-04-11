const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const knex = require("./knex.js");

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
      knex.select("*").from("user").where("kakao_id",kkoidtkn.sub).then((userdata)=>{
        if(userdata){
          data1.data.registerd=1;
        }else{
          data1.data.registerd=0;
        }
        res.json(data1.data);
      });
    })
  })

  router.put("/signup", (req, res) => {
    let tkn = req.headers.authorization.split("Bearer ")[1];
    let decodetoken = jwt.decode(tkn);
    let iss = decodetoken.iss;
    knex.transaction((trx) => {
      let kakaoid=null;
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
        kakaoid=decodetoken.sub;
      }
      if (iss == "https://appleid.apple.com") {
        appleAccessCode = req.body.access_token;
        appleRefreshCode = req.body.refresh_token;
        appleIdToken = tkn;
      }
      return trx
        .insert(
          {
            kakao_access_code: kakaoAccessCode,
            kakao_refresh_code: kakaoRefreshCode,
            kakao_id_token: kakaoIdToken,
            apple_access_code: appleAccessCode,
            apple_refresh_code: appleRefreshCode,
            apple_id_token: appleIdToken,
            kakao_id: kakaoid,
            email: "bbasung@test.com"
          },
          "id"
        )
        .into("user")
        // .then((ids) => {
        //   return trx
        //     .insert({
        //       id: ids[0],
        //       nickname: req.body.name,
        //       profile_image: req.body.profileImage,
        //     })
        //     .into("profile")
        //     .then(() => {
        //       let friends = req.body.friends;
        //       if (friends.length > maxFriends) {
        //         throw new Error("You have reached the maximum number of friends");
        //       }
        //       friends.forEach((friend) => {
        //         friend.user_id = ids[0];
        //       });
        //       return trx.insert(friends).into("friend_list");
        //     });
        // })
        .then(() => {
          res.json({ success: 1 });
        })
        .catch((err) => {
          res.json({ success: 0, error: err });
        });
    });
  });
module.exports = router;