const express = require("express");
const router = express.Router();
const axios = require("axios");

const knex = require("./knex.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

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
                    sucess: 1
                })
            })
    } else {
        res.status(200).json({
            success: 0
        })
    }
})

router.put("/id",(req,res)=>{
    knex("profile")
    .where("user_id",req.body.original_id)
    .update({user_id:req.body.change_id})
    .then(()=>{
        res.status(200).json({success:1})
    })
    .catch((err)=>{
        let errdata={
            success:0,
            errcode: err.errno,
            errmsg:"기타 오류가 발생했습니다."
        }
        if(err.errno==1062){
            errdata.errmsg="아이디가 중복됩니다."
        }
        console.error(err)
        res.json(errdata)
    })
});

router.post("/nickname/register", (req, res) => {
    const { user_id, nickname } = req.body;  // user_id와 nickname을 받음

    // user_id와 nickname이 존재하는지 확인
    if (!user_id || !nickname) {
        return res.status(400).json({ message: "user_id and nickname are required." });
    }

    // user_id가 user 테이블에 존재하는지 확인
    knex("user")
        .select("id")
        .where("id", user_id)
        .then((user) => {
            if (user.length === 0) {
                return res.status(404).json({ message: "User not found." });
            }

            // profile 테이블에 user_id와 nickname을 삽입
            return knex("profile")
                .insert({
                    id: user_id,  // user_id와 nickname을 profile 테이블에 삽입
                    nickname: nickname
                });
        })
        .then(() => {
            res.status(201).json({
                message: "Nickname successfully registered."
            });
        })
        .catch((err) => {
            console.error(err);
            res.status(500).json({
                message: "Failed to register nickname."
            });
        });
});


router.get("/nickname/:user_id", (req, res) => {
    const user_id = req.params.user_id;  // URL에서 user_id를 받아옴

    // user_id가 profile 테이블에 존재하는지 확인
    knex("profile")
        .select("nickname")
        .where("id", user_id)
        .then((result) => {
            if (result.length === 0) {
                return res.status(404).json({ message: "Nickname not found for the given user_id." });
            }
            
            // 닉네임을 응답으로 반환
            res.status(200).json({
                user_id: user_id,
                nickname: result[0].nickname
            });
        })
        .catch((err) => {
            console.error(err);
            res.status(500).json({
                message: "Failed to retrieve nickname."
            });
        });
});


module.exports = router;








module.exports = router;