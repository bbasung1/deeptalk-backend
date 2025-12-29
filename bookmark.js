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
    const [dupcheck] = await knex("bookmark").select("*").where({ type: req.body.type, user_id: ourid, post_id: req.params.id })
    console.log(dupcheck);
    const trx = await knex.transaction();
    const type = req.body.type == 0 ? "talk" : "think";
    const num_name = type + "_num";
    const [brf_bookmark] = await knex(type).select("mylist").where(num_name, req.params.id);
    console.log(dupcheck);
    if (dupcheck != undefined) {
        try {
            await trx("bookmark").where({ type: req.body.type, post_id: req.params.id }).del();
            await trx(type).update({ mylist: brf_bookmark.mylist - 1 }).where(num_name, req.params.id);
            await trx.commit();
            return res.json({ success: 1, msg: "북마크 해제 완료" });
        } catch (err) {
            console.error(err);
            return res.json({ success: 0 });
        }
    }
    try {
        await trx("bookmark").insert({ user_id: ourid, type: req.body.type, post_id: req.params.id });
        await trx(type).update({ mylist: brf_bookmark.mylist + 1 }).where(num_name, req.params.id);
        await trx.commit();
        return res.json({ success: 1, msg: "북마크 완료" });
    } catch (err) {
        console.error(err);
        return res.json({ success: 0 });
    }
});

router.get("/list", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) {
        return res.status(400).json({ success: 0, msg: "id 인식 실패" });
    }
    // const pt_type_bool = req.query.type == "Jam-Talk" ? 0 : 1
    // const pt_type_name = req.query.type == "Jam-Talk" ? "talk" : "think"
    //위 두 줄은 query를 Jam-Talk/Jin-Talk으로 바꿀 경우 활성화 할것
    const pt_type_bool = req.query.type
    const pt_type_name = req.query.type == 0 ? "talk" : "think"
    const num_name = pt_type_name + "_num"
    const list = await knex(pt_type_name).whereIn(num_name, function () {
        this.select("post_id").from("bookmark").where({ type: pt_type_bool, user_id: ourid });
    });
    return res.json(list);
});

module.exports = router;