const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, add_nickname, user_id_to_id, islikeandbookmark, iscommentandquote } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");
const { buildFinalScoreRaw, buildCandidateWhereRaw, tieBreakBucketSQL } = require("./feedScoring.js");

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
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!ourid) return res.json({ error: "인증 실패" }); // 인증 실패 시 종료
    const page = parseInt(req.query.page) || 0;

    const talk = await resort_post("talk", ourid, page);

    res.json(await buildPostResponse(talk, ourid));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "서버오류발생" });
  }
});

// /Jin-Talk: 차단 사용자 글 제외
router.get("/Jin-Talk", async (req, res) => {
  try {
    const ourid = await define_id(req.headers.authorization, res);
    if (res.headersSent) return; // define_id가 이미 에러 응답을 보냄
    if (!ourid) return; // 인증 실패 시 종료
    const page = parseInt(req.query.page) || 0;

    const think = await resort_post("think", ourid, page);

    res.json(await buildPostResponse(think, ourid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버오류발생" });
  }
});

// 코지 휴먼즈 클럽 개인화 홈 피드 v1 정렬 알고리즘 (기획서 2026.06.25).
// 점수 산식(RelationBase / InteractionBonus / PopularityScore / FreshnessScore / FinalScore)은
// feedScoring.js 에 정의되어 있다. 자세한 근거는 그 파일과 기획서 각 장 주석을 참고.
async function resort_post(type, ourid, page) {
  const type_code = type == "talk" ? 0 : (type == "think" ? 1 : 2);
  const PAGE_SIZE = 10;

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
    .whereNull("p.deleted_at")
    // 기획서 8장: 후보 게시글 수집 범위 (최근 7일 + 팔로우/팔로워 + 과거 상호작용 + 본인 글)
    .whereRaw(buildCandidateWhereRaw("p", ourid))
    // select 내에서 knex.raw()를 사용하여 계산된 컬럼에 별칭(Alias)을 지정합니다.
    .select(
      'p.*',
      "profile.user_id as user_id",
      "profile.nickname",
      "profile.image as profile_image",
      ...islikeandbookmark(ourid, type, type_code),
      ...iscommentandquote(ourid, type, type_code, "is_comment", "p"),
      buildFinalScoreRaw("p", ourid).wrap("(", ") as final_score")
    )
    // 기획서 6장: 점수 차이가 작으면(epsilon=3) 더 최신 글을 우선하기 위해 점수를 버킷화해서 1차 정렬,
    // 그 안에서 timestamp로 2차 정렬한다.
    .orderByRaw(`${tieBreakBucketSQL("final_score")} DESC, p.timestamp DESC`)
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  return posts;
}

module.exports = router;
