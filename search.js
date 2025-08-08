const express = require("express");
const router = express.Router();
const defind_id = require('./general.js').define_id;
const knex = require("./knex.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post("/", async (req, res) => {
    let user_id = req.body.id;
    let id = await defind_id(user_id, res);
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
            .select('*');
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
            .select('*');
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