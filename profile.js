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

module.exports = router;