const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id } = require("./general.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post("/:id", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) {
        return res.status(400).json({ success: 0, msg: "id 인식 실패" });
    }
    const [dupcheck] = await knex("post_like").select("*").where({ type: req.body.type, user_id: req.params.id })
    console.log(dupcheck);
    const trx = await knex.transaction();
    const type = req.body.type == 0 ? "talk" : "think";
    const num_name = type + "_num";
    const [brf_bookmark] = await knex(type).select("mylist").where(num_name, req.params.id);
    console.log(dupcheck);
    if (dupcheck != undefined) {
        try {
            await trx("post_like").where({ type: req.body.type, post_id: req.params.id }).del();
            await trx(type).update({ like: brf_bookmark.like - 1 }).where(num_name, req.params.id);
            await trx.commit();
            return res.json({ success: 1, msg: "좋아요 해제 완료" });
        } catch (err) {
            console.error(err);
            return res.json({ success: 0 });
        }
    }
    try {
        await trx("bookmark").insert({ user_id: ourid, type: req.body.type, post_id: req.params.id });
        await trx(type).update({ like: brf_bookmark.like + 1 }).where(num_name, req.params.id);
        await trx.commit();
        return res.json({ success: 1, msg: "좋아요 완료" });
    } catch (err) {
        console.error(err);
        return res.json({ success: 0 });
    }
});

module.exports = router;