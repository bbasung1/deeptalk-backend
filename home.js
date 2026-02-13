const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, add_nickname } = require("./general.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// /Jam-Talk: 차단 사용자 글 제외
router.get("/Jam-Talk", async (req, res) => {
  try {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const talk = await resort_post("talk", ourid);

    res.json(talk);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

// /Jin-Talk: 차단 사용자 글 제외
router.get("/Jin-Talk", async (req, res) => {
  try {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const think = await resort_post("think", ourid)

    res.json(think);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

async function resort_post(type, ourid) {
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

  let posts = await knex(type)
    .whereNotIn("writer_id", function () {
      this.select("blocked_user_id")
        .from("block_list")
        .where("user_id", ourid);
    })
    .whereNotIn("writer_id", function () {
      this.select("user_id")
        .from("block_list")
        .where("blocked_user_id", ourid)
        .andWhere("type", 0);
    })
    // select 내에서 knex.raw()를 사용하여 계산된 컬럼에 별칭(Alias)을 지정합니다.
    .select(
      '*',
      knex.raw(`${rawEngagementScoreSQL} as engagement_score`),
      knex.raw(`${rawFreshnessScoreSQL} as freshness_score`),
      knex.raw(`${rawFinalScoreSQL} as final_score`)
    )
    .orderBy('final_score', 'desc');
  for (i of posts) {
    delete i["engagement_score"];
    delete i["freshness_score"];
    delete i["final_score"];
    nickname = await add_nickname(i["writer_id"]);
    i.nickname = nickname;
  }
  return posts
}

module.exports = router;
