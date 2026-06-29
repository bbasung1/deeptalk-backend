const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, islikeandbookmark, iscommentandquote } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.post("/:id", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!ourid) {
        return res.status(400).json({ success: 0, msg: "id 인식 실패" });
    }
    const [dupcheck] = await knex("bookmark").select("*").where({ type: req.body.type, user_id: ourid, post_id: req.params.id }).whereNull("deleted_at")
    console.log(dupcheck);
    const trx = await knex.transaction();
    const type = req.body.type == 0 ? "talk" : "think";
    const num_name = type + "_num";
    // const [brf_bookmark] = await knex(type).select("mylist").where(num_name, req.params.id);
    console.log(dupcheck);
    if (dupcheck != undefined) {
        try {
            // 하드 삭제(.del()) 대신 deleted_at을 채우는 소프트 삭제로 전환 (북마크 이력 보존).
            await trx("bookmark").where({ type: req.body.type, post_id: req.params.id, user_id: ourid }).whereNull("deleted_at").update({ deleted_at: knex.fn.now() });
            await trx(type).decrement("mylist", 1).where(num_name, req.params.id);
            await trx.commit();
            const output = trx(type).select("mylist").where(num_name, req.params.id).first();
            return res.json({ success: 1, msg: "북마크 해제 완료", bookmark: output.mylist });
        } catch (err) {
            trx.rollback()
            console.error(err);
            return res.json({ success: 0 });
        }
    }
    try {
        await trx("bookmark").insert({ user_id: ourid, type: req.body.type, post_id: req.params.id });
        await trx(type).increment("mylist", 1).where(num_name, req.params.id);
        await trx.commit();
        const output = trx(type).select("mylist").where(num_name, req.params.id).first();
        return res.json({ success: 1, msg: "북마크 완료", bookmark: output.mylist });
    } catch (err) {
        trx.rollback();
        console.error(err);
        return res.json({ success: 0 });
    }
});

router.get("/list", async (req, res) => {
    const ourid = await define_id(req.headers.authorization, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!ourid) {
        return res.status(400).json({ success: 0, msg: "id 인식 실패" });
    }
    // const pt_type_bool = req.query.type == "Jam-Talk" ? 0 : 1
    // const pt_type_name = req.query.type == "Jam-Talk" ? "talk" : "think"
    //위 두 줄은 query를 Jam-Talk/Jin-Talk으로 바꿀 경우 활성화 할것
    const pt_type_bool = req.query.type
    const pt_type_name = req.query.type == 0 ? "talk" : "think"
    const num_name = pt_type_name + "_num"
    const list = await knex(pt_type_name)
        .leftJoin("profile", `${pt_type_name}.writer_id`, "profile.id")
        .select(`${pt_type_name}.*`, ...islikeandbookmark(ourid, pt_type_name, pt_type_bool), ...iscommentandquote(ourid, pt_type_name, pt_type_bool, "is_comment", pt_type_name), "profile.nickname", "profile.image as profile_image")
        .whereIn(num_name, function () {
            this.select("post_id").from("bookmark").where({ type: pt_type_bool, user_id: ourid }).whereNull("deleted_at");
        });
    return res.json(await buildPostResponse(list, ourid));
});

module.exports = router;