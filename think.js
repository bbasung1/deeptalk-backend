const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const convert_our_id = require('./general.js').define_id;

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get("/", async (req, res) => {
    let user_id = req.headers.authorization;
    let id = null;
    console.log(user_id);
    if (user_id != undefined) {
        id = await convert_our_id(user_id, res);
    };
    try {
        const think = await await knex('think')
            .whereNotIn('writer_id', function () {
                this.select('block_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .select('*');
        res.json(think);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

module.exports = router;