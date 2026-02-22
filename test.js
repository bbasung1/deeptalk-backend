const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const define_id = require('./general.js').define_id;
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

router.get("/", async (req, res) => {
    const trx = await knex.transaction();

    try {
        await Promise.all([
            trx("talk").whereIn("talk_num", function () {
                this.select("post_id").from("post_like").where({ type: 0, user_id: 1 });
            }).decrement("like", 1),

            trx("think").whereIn("think_num", function () {
                this.select("post_id").from("post_like").where({ type: 1, user_id: 1 });
            }).decrement("like", 1)
        ]);

        await trx.commit();
    } catch (e) {
        await trx.rollback();
    }

});

module.exports = router;