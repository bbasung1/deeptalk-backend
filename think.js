const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { add_nickname, define_id, isfollowandbookmark, decrement_quote_num } = require("./general.js");
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
        [think] = await knex('think as p')
            .leftJoin("profile", "p.writer_id", "profile.id")
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .where("p.think_num", req.params.id)
            .select('p.*', "profile.nickname", ...isfollowandbookmark(id, "think", 1));
        if (think == undefined) {
            return res.json({ msg: "없거나 비공개인 포스트 입니다" })
        }
        think.views = think.views + 1;
        await knex("think").where("think_num", req.params.id).update({ views: think.views });
        nickname = await add_nickname(think.writer_id);
        think.nickname = nickname;
        return res.json(think);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

router.delete("/:id", async (req, res) => {
    const id_token = req.headers.authorization;
    const id = await define_id(id_token, res);
    const trx = await knex.transaction();
    console.log(id);
    const senddata = { success: 1 }
    const post_info = await knex("think").select("writer_id", "quote", "quote_type").where("think_num", req.params.id).first();
    if (id != post_info.writer_id) {
        return res.status(403).json({ "msg": "삭제 권한이 없습니다", "code": "4101" })
    }
    try {
        await trx("think").where("think_num", req.params.id).delete();
        if (post_info.quote) {
            senddata.quote_num = await decrement_quote_num(post_info, trx);
        }
        await trx.commit();
        return res.json(senddata);
    } catch (err) {
        await trx.rollback();
        senddata.success = 0;
        console.error(err);
        return res.status(500).json(senddata);
    }
})

module.exports = router;