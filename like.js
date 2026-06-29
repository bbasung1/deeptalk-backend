const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, islikeandbookmark, iscommentandquote, add_nickname, logContentEvent } = require('./general.js');
const { buildPostResponse } = require("./postSerializer.js");
const { sendReactionNotification } = require('./fcm.js');
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
    console.log(req.body);
    const [dupcheck] = await knex("post_like").select("*").where({ type: req.body.type, user_id: ourid, post_id: req.params.id }).whereNull("deleted_at")
    console.log(dupcheck);
    const trx = await knex.transaction();
    const type = req.body.type == 0 ? "talk" : (req.body.type == 1 ? "think" : "comment");
    const num_name = type + "_num";
    // const [brf_like] = await knex(type).select("like").where(num_name, req.params.id);
    // console.log(dupcheck);
    if (dupcheck != undefined) {
        try {
            // 하드 삭제(.del()) 대신 deleted_at을 채우는 소프트 삭제로 전환 (좋아요 이력 보존).
            await trx("post_like").where({ type: req.body.type, post_id: req.params.id, user_id: ourid }).whereNull("deleted_at").update({ deleted_at: knex.fn.now() });
            // await trx(type).update({ like: brf_like.like - 1 }).where(num_name, req.params.id);
            await trx(type).where(num_name, req.params.id).decrement("like", 1);
            await trx.commit();
            const output = await knex(type).select("like").where(num_name, req.params.id).first();
            console.log("삭제output:", output)
            return res.json({ success: 1, msg: "좋아요 해제 완료", like: output.like });
        } catch (err) {
            await trx.rollback();
            console.error(err);
            console.log("삭제 에러")
            return res.json({ success: 0 });
        }
    }
    // console.log(brf_like);
    try {
        await trx("post_like").insert({ user_id: ourid, type: req.body.type, post_id: req.params.id });
        await trx(type).where(num_name, req.params.id).increment("like", 1);
        await trx.commit();
        const output = await knex(type).select("like").where(num_name, req.params.id).first();
        console.log("추가output:", output)
        res.json({ success: 1, msg: "좋아요 완료", like: output.like });

        // 첫 반응(좋아요) 시각 등 분석용 기록 (응답 블로킹 방지를 위해 await 생략, 해제 시에는 기록하지 않음)
        logContentEvent(ourid, "like");

        // 게시물 작성자에게 반응 알림 발송 (응답 블로킹 방지를 위해 await 생략, talk/think에만 해당)
        if (type === "talk" || type === "think") {
            const nickname = await add_nickname(ourid);
            sendReactionNotification({
                table: type,
                postNum: req.params.id,
                actorId: ourid,
                actorNickname: nickname,
                reactionType: "like"
            });
        }
        return;
    } catch (err) {
        await trx.rollback();
        console.log("추가 에러");
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
        .select(`${pt_type_name}.*`, ...islikeandbookmark(ourid, pt_type_name, pt_type_bool), ...iscommentandquote(ourid, pt_type_name, pt_type_bool, "is_comment", pt_type_name), "profile.nickname", "profile.image as profile_image").whereIn(num_name, function () {
            this.select("post_id").from("post_like").where({ type: pt_type_bool, user_id: ourid }).whereNull("deleted_at");
        });
    return res.json(await buildPostResponse(list, ourid));
});

module.exports = router;