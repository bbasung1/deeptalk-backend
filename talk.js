const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { decrement_quote_num, define_id, islikeandbookmark } = require("./general.js");
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
    };
    try {
        [talk] = await knex('talk as p')
            .leftJoin("profile", "p.writer_id", "profile.id")
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .where("p.talk_num", req.params.id)
            .select('p.*', "profile.nickname", "profile.image as profile_image", ...islikeandbookmark(id, "talk", 0));
        if (talk == undefined) {
            return res.json({ msg: "없거나 비공개인 포스트 입니다" })
        }
        talk.views = talk.views + 1;
        await knex("talk").where("talk_num", req.params.id).update({ views: talk.views });
        return res.json(await buildPostResponse(talk, id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

router.delete("/:id", async (req, res) => {
    const id_token = req.headers.authorization;
    const id = await define_id(id_token, res);
    const trx = await knex.transaction();
    post_info = await knex("talk").select("quote", "quote_type", "vote", "writer_id").where("talk_num", req.params.id).first();
    if (id != post_info.writer_id) {
        return res.status(403).json({ "msg": "삭제 권한이 없습니다", "code": "4101" })
    }
    const senddata = { success: 1 }
    try {
        await trx("talk").where("talk_num", req.params.id).delete();
        if (post_info.quote) {
            senddata.quote_num = await decrement_quote_num(post_info, trx);
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
        trx.commit();
        return res.json(senddata)
    } catch (err) {
        trx.rollback();
        console.error(err);
        senddata.success = 0;
        return res.status(500).json(senddata);
    }
})
module.exports = router;