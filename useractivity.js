const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const defind_id = require('./general.js').define_id;

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
const { user_id_to_id, islikeandbookmark } = require("./general.js");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.post("/", async (req, res) => {
    let user_id = req.body.user_id;
    const page = req.body.page || 0;
    let id = await user_id_to_id(user_id);
    if (req.body.type == "talk") {
        const talk = await knex('talk')
            .where('writer_id', id)
            .select('*', ...islikeandbookmark(id, "talk", 0)).limit(10)
            .offset(page * 10);
        res.json(talk);
    }
    if (req.body.type == "think") {
        const think = await knex('think')
            .where('writer_id', id)
            .select('*', ...islikeandbookmark(id, "think", 1)).limit(10)
            .offset(page * 10);
        res.json(think);
    }
    if (req.body.type == "comment") {
        const user = await knex('comment')
            .where('user_id', id)
            .select("*", ...islikeandbookmark(id, "comment", 2)).limit(10)
            .offset(page * 10);
        res.json(user);
    }
})

module.exports = router;