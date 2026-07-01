const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { add_nickname, define_id, islikeandbookmark, iscommentandquote, decrement_quote_num } = require("./general.js");
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

router.get("/:id", async (req, res) => {
    let user_id = req.headers.authorization;
    let id = null;
    console.log(user_id);
    if (user_id != undefined) {
        id = await define_id(user_id, res);
        if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    };
    try {
        const [think] = await knex('think as p')
            .leftJoin("profile", "p.writer_id", "profile.id")
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .where("p.think_num", req.params.id)
            .whereNull("p.deleted_at")
            .select('p.*', "profile.user_id as user_id", "profile.nickname", "profile.image as profile_image", ...islikeandbookmark(id, "think", 1), ...iscommentandquote(id, "think", 1, "is_comment", "p"));
        if (think == undefined) {
            return res.json({ msg: "없거나 비공개인 포스트 입니다" })
        }
        think.views = think.views + 1;
        await knex("think").where("think_num", req.params.id).update({ views: think.views });
        return res.json(await buildPostResponse(think, id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

router.delete("/:id", async (req, res) => {
    const id_token = req.headers.authorization;
    const id = await define_id(id_token, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    const trx = await knex.transaction();
    console.log(id);
    const senddata = { success: 1 }
    const post_info = await knex("think").select("writer_id", "quote", "quote_type", "vote", "draft").where("think_num", req.params.id).whereNull("deleted_at").first();
    if (!post_info) {
        return res.status(404).json({ msg: "글을 찾을 수 없습니다" });
    }
    if (id != post_info.writer_id) {
        return res.status(403).json({ "msg": "삭제 권한이 없습니다", "code": "4101" })
    }
    try {
        // 하드 삭제(.delete()) 대신 deleted_at을 채우는 소프트 삭제로 전환 (talk과 동일한 패턴).
        // visibility_status도 동시 업데이트 (alter_add_visibility_status_columns.sql 참고).
        await trx("think").where("think_num", req.params.id).update({ deleted_at: knex.fn.now(), visibility_status: "deleted_by_user" });
        console.log(post_info);
        let quote_num;
        if (post_info.quote && post_info.draft == 0) {
            quote_num = await decrement_quote_num(post_info, trx);
        }
        if (post_info.vote) {
            try {
                // vote_count(FK) 먼저 삭제 후 vote 삭제
                await trx("vote_count").where({ vote_num: post_info.vote }).delete();
                await trx("vote").where({ vote_num: post_info.vote }).delete();
            } catch (err) {
                console.error(err);
                trx.rollback();
                return res.status(500).json({ success: 0, message: "투표 삭제 과정에서 문제가 발생했습니다." });
            }
        }
        await trx.commit();
        const output = { success: 1, quote_num };
        console.log(output);
        return res.json(output);
    } catch (err) {
        await trx.rollback();
        senddata.success = 0;
        console.error(err);
        return res.status(500).json(senddata);
    }
})

module.exports = router;