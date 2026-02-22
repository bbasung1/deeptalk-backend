const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { add_nickname, define_id } = require("./general.js");
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
        [talk] = await knex('talk')
            .whereNotIn('writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .where("talk_num", req.params.id)
            .select('*');
        if (talk == undefined) {
            return res.json({ msg: "없거나 비공개인 포스트 입니다" })
        }
        talk.views = talk.views + 1;
        await knex("talk").where("talk_num", req.params.id).update({ views: talk.views });
        nickname = await add_nickname(talk.writer_id);
        talk.nickname = nickname;
        return res.json(talk);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

router.delete("/:id", async (req, res) => {
    const id_token = req.headers.authorization;
    const id = await define_id(id_token, res);
    console.log(id);
    console.log(req.params.id);
    writer_id = await knex("talk").select("*").where("talk_num", req.params.id).first();
    console.log(writer_id);
    if (id != writer_id.writer_id) {
        return res.status(403).json({ "msg": "삭제 권한이 없습니다", "code": "4101" })
    }
    try {
        await knex("talk").where("talk_num", req.params.id).delete();
        return res.json({ "success": 1 })
    } catch {
        return res.status(500).json({ "success": 0 });
    }
})

module.exports = router;