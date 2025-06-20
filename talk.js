const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const convert_our_id = require('./general.js').convert_our_id;
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post("/", async (req, res) => {
    let user_id = req.body.id;
    let id = null;
    console.log(user_id);
    if (user_id != undefined) {
        id = await convert_our_id(user_id);
    };
    try {
        const talk = await knex('talk')
            .whereNotIn('writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .select('*');
        res.json(talk);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

module.exports = router;