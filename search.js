const express = require("express");
const router = express.Router();
const defind_id = require('./general.js').define_id;
const knex = require("./knex.js");

const { stream } = require("./log.js");
const morgan = require("morgan");
const { user_id_to_id, isfollowandbookmark } = require("./general.js");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post("/", async (req, res) => {
    let tmp = req.headers.authorization;
    const page = req.body.page || 0;
    let id = null;
    if (tmp) {
        id = await defind_id(tmp, res);
    }
    if (req.body.type == "talk") {
        const talk = await knex('talk as p')
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('p.header', 'like', `%${req.body.searchparam}%`)
                    .orWhere('p.subject', 'like', `%${req.body.searchparam}%`);
            })
            .leftJoin("profile", "p.writer_id", "profile.id")
            .select('p.*', 'profile.nickname', 'profile.image as profile_image', ...isfollowandbookmark(id, "talk", 0))
            .limit(10).offset(page * 10);
        res.json(talk);
    }
    if (req.body.type == "think") {
        const think = await knex('think as p')
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('p.header', 'like', `%${req.body.searchparam}%`)
                    .orWhere('p.subject', 'like', `%${req.body.searchparam}%`);
            })
            .leftJoin("profile", "p.writer_id", "profile.id")
            .select('p.*', 'profile.nickname', 'profile.image as profile_image', ...isfollowandbookmark(id, "think", 1))
            .limit(10)
            .offset(page * 10);;
        res.json(think);
    }
    if (req.body.type == "user") {
        const user = await knex('profile')
            .whereNotIn('user_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('user_id', 'like', `%${req.body.searchparam}%`)
                    .orWhere('nickname', 'like', `%${req.body.searchparam}%`)
                    ;
            })
            .select('nickname', 'image as profile_image', 'user_id', knex.raw("EXISTS (SELECT 1 FROM follow WHERE user_id = ? AND friend_id = profile.id) AS is_follow", [id]))
            .limit(10)
            .offset(page * 10);
        res.json(user);
    }
})

module.exports = router;