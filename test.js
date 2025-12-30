const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const define_id = require('./general.js').define_id;
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get("/", async (req, res) => {
    const halfLifeHours = 24;
    const weightEngagement = 1.0;
    const commentsWeight = 2.0;
    const retweetsWeight = 1.5;
    const likesWeight = 1.2;
    const bookmarksWeight = 1.0;
    const viewsWeight = 1.0;

    const rawEngagementScoreSQL = `
        LOG(1 + 
            (comment * ${commentsWeight}) + 
            (quote_num * ${retweetsWeight}) + 
            (\`like\` * ${likesWeight}) + 
            (mylist * ${bookmarksWeight}) +
            (\`views\` * ${viewsWeight})
        )
    `;

    const rawFreshnessScoreSQL = `
        POW(2, - (TIMESTAMPDIFF(HOUR, timestamp, NOW()) / ${halfLifeHours}))
    `;

    const rawFinalScoreSQL = `
        ((${rawEngagementScoreSQL}) * ${weightEngagement}) * (${rawFreshnessScoreSQL})
    `;

    let posts = await knex('talk')
        // select 내에서 knex.raw()를 사용하여 계산된 컬럼에 별칭(Alias)을 지정합니다.
        .select(
            '*',
            knex.raw(`${rawEngagementScoreSQL} as engagement_score`),
            knex.raw(`${rawFreshnessScoreSQL} as freshness_score`),
            knex.raw(`${rawFinalScoreSQL} as final_score`)
        )
        .orderBy('final_score', 'desc');
    for (i of posts) {
        console.log(i);
        delete i["engagement_score"];
        delete i["freshness_score"];
        delete i["final_score"];
        console.log(i);
    }
    res.json(posts);

});

module.exports = router;