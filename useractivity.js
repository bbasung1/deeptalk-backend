const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const defind_id = require('./general.js').define_id;

router.use(express.json());
router.use(express.urlencoded({ extended: true }));


router.post("/", async (req, res) => {
    let user_id = req.headers.authorization;
    let id = await defind_id(user_id, res);
    if (req.body.type == "talk") {
        const talk = await knex('talk')
            .where('writer_id', id)
            .select('*');
        res.json(talk);
    }
    if (req.body.type == "think") {
        const think = await knex('think')
            .where('writer_id', id)
            .select('*');
        res.json(think);
    }
    if (req.body.type == "comment") {
        const user = await knex('comment')
            .where('user_id', id)
            .select("*");
        res.json(user);
    }
})

module.exports = router;