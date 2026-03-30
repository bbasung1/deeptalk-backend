const express = require("express");
const router = express.Router();
const knex = require("./knex.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
const { user_id_to_id, define_id } = require("./general.js");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.get("/:id", async (req, res) => {
    const our_id = await define_id(req.headers.authorization, res);
    let [already_vote] = await knex("vote_count").select("*").where({ "vote_num": req.params.id, "our_id": our_id })
    let [vote_info] = await knex("vote").select("*").where("vote_num", req.params.id);
    if (already_vote == undefined || new Date(vote_info.end_date) < new Date()) {
        try {
            delete vote_info.vote_num;
            delete vote_info.post_type;
            delete vote_info.post_num;
            return res.json(vote_info);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ success: 0, message: "투표 정보를 불러오는 과정에서 문제가 발생했습니다." });
        }
    } else {
        let [vote_info] = await knex("v_vote_results").select("*").where("vote_num", req.params.id);
        delete vote_info.vote_num;
        delete vote_info.post_type;
        delete vote_info.post_num;
        vote_info.user_choice = already_vote.point;
        return res.json(vote_info);
    }
})
router.post("/:id", async (req, res) => {
    const our_id = await define_id(req.headers.authorization, res);
    const trx = await knex.transaction();
    try {
        let [already_vote] = await trx("vote_count").select("*").where({ "vote_num": req.params.id, "our_id": our_id })
        if (already_vote != undefined) {
            trx.rollback();
            console.log(already_vote);
            return res.status(401).json({ success: 0, message: "이미 투표하셨습니다." });
        }
        let [vote_info] = await trx("vote").select("end_date").where("vote_num", req.params.id);
        if (new Date(vote_info.end_date) < new Date()) {
            trx.rollback();
            return res.status(401).json({ success: 0, message: "이미 종료된 투표입니다." });
        }
        await trx("vote_count").insert({ "vote_num": req.params.id, our_id, point: req.body.choice });
        let [result] = await trx("v_vote_results").select("*").where("vote_num", req.params.id);
        delete result.vote_num;
        delete result.post_type;
        delete result.post_num;
        result.success = 1;
        await trx.commit();
        return res.json(result);
    } catch (err) {
        trx.rollback();
        console.error(err);
        return res.status(500).json({ success: 0, message: "투표 과정에서 문제가 발생했습니다." });
    }
})
module.exports = router;