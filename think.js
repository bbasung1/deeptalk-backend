const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const define_id = require('./general.js').define_id;
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get("/:id", async (req, res) => {
    let user_id = req.headers.authorization;
    let id = null;
    console.log(user_id);
    if (user_id != undefined) {
        id = await define_id(user_id, res);
    };
    try {
        const [think] = await knex('think')
            .whereNotIn('writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .where("think_num", req.params.id)
            .select('*');
        if (think == undefined) {
            return res.json({ msg: "없거나 비공개인 포스트 입니다" })
        }
        return res.json(think);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버오류발생" });
    }
});

module.exports = router;