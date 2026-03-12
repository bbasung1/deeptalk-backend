const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, add_nickname, user_id_to_id, isfollowandbookmark } = require("./general.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { stream } = require("./log.js");
const morgan = require("morgan");
const { profile } = require("winston");
const { post } = require("./search.js");
router.use(
  morgan(
    "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
    { stream: stream }
  )
);

// /Jam-Talk: 차단 사용자 글 제외
router.get("/Jam-Talk", async (req, res) => {
  try {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return res.json({ error: "인증 실패" }); // 인증 실패 시 종료
    const page = req.query.page || 0;

    const talk = await resort_post("talk", ourid, page);

    res.json(talk);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "서버오류발생" });
  }
});

// /Jin-Talk: 차단 사용자 글 제외
router.get("/Jin-Talk", async (req, res) => {
  try {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료
    const page = parseInt(req.query.page) || 0;

    const think = await resort_post("think", ourid, page);

    res.json(think);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

async function resort_post(type, ourid, page) {
  const halfLifeHours = 24;
  const weightEngagement = 1.0;
  const commentsWeight = 2.0;
  const retweetsWeight = 1.5;
  const likesWeight = 1.2;
  const bookmarksWeight = 1.0;
  const viewsWeight = 1.0;
  const type_code = type == "talk" ? 0 : (type == "think" ? 1 : 2)
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

  let posts = await knex(`${type} as p`)
    .leftJoin("profile", "p.writer_id", "profile.id")
    .whereNotIn("p.writer_id", function () {
      this.select("blocked_user_id")
        .from("block_list")
        .where("user_id", ourid);
    })
    .whereNotIn("p.writer_id", function () {
      this.select("user_id")
        .from("block_list")
        .where("blocked_user_id", ourid)
        .andWhere("type", 0);
    })
    // select 내에서 knex.raw()를 사용하여 계산된 컬럼에 별칭(Alias)을 지정합니다.
    .select(
      'p.*',
      "profile.nickname",
      "profile.image as profile_image",
      ...isfollowandbookmark(ourid, type, type_code)
    )
    // .orderBy(knex.raw(rawFinalScoreSQL), 'desc');
    .orderByRaw(`${rawFreshnessScoreSQL} DESC`)
    .limit(10)
    .offset(page * 10);
  // test = parseInt(page) + 1
  return posts;
  // return { data: posts, next_page: test };
}

module.exports = router;
