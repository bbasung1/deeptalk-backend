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
    let id = null;
    if (tmp) {
        id = await defind_id(tmp, res);
    }
    if (req.body.type == "talk") {
        const talk = await knex('talk')
            .whereNotIn('writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('header', 'like', `%${req.body.searchparam}%`)
                    .orWhere('subject', 'like', `%${req.body.searchparam}%`);
            })
            .select('talk.*', ...isfollowandbookmark(id, "talk", 0));
        res.json(talk);
    }
    if (req.body.type == "think") {
        const think = await knex('think')
            .whereNotIn('writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('header', 'like', `%${req.body.searchparam}%`)
                    .orWhere('subject', 'like', `%${req.body.searchparam}%`);
            })
            .select('think.*', ...isbookmarkandfollow(id, "think", 1));
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
                    .orWhere('nickname', 'like', `%${req.body.searchparam}%`);
            })
            .select('nickname', 'profile_image', 'status_message', 'user_id');
        res.json(user);
    }
})

module.exports = router;