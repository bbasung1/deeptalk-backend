const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");


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
module.exports = router;