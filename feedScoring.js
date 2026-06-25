/**
 * feedScoring.js
 *
 * 코지 휴먼즈 클럽 개인화 홈 피드 v1 정렬 알고리즘 (기획서 2026.06.25 버전) 구현.
 *
 * 산식 요약 (기획서 7장 "최종 정렬 공식" 기준):
 *   FinalScore(u,p) = 45 * RelevanceScore(u,p) + 25 * PopularityScore(p) + 30 * FreshnessScore(p)
 *
 *   RelevanceScore(u,p)   = min(1, RelationBase(u, writer) + InteractionBonus(u, writer))   (4장)
 *   RelationBase          = follow 테이블 기반 관계 점수 (4-1)
 *   InteractionBonus      = u가 writer에게 보낸 좋아요/댓글/인용 가중합, 최대 0.25 (4-2)
 *   PopularityScore(p)    = min(1, log(1+raw)/log(1+P_ref)), raw = like*1 + comment*2 + quote_num*3 (5장)
 *   FreshnessScore(p)     = timestamp 기준 계단식 감쇠 (6장)
 *
 * 주의:
 * - 이 모듈은 talk/think 두 테이블 모두에서 재사용할 수 있도록 호출하는 쪽(outerRef)에서
 *   바깥 쿼리의 별칭(예: "p")을 넘겨받아 그 별칭의 writer_id / timestamp / like / comment / quote_num
 *   컬럼을 참조한다. 호출부의 FROM 별칭과 정확히 일치시켜야 한다 (general.js의 iscommentandquote와 동일한 패턴).
 * - comment 테이블은 user_id(외부 id)와 writer_id(내부 id, profile.id)를 모두 저장한다
 *   (comment.js insert 참고). 여기서는 writer_id를 직접 비교하므로 profile 조인이 필요 없다.
 * - 가중치/기준값은 기획서 7장의 초기 추천값이다. 운영 데이터가 쌓이면 P_ref 등을 동적으로 바꿀 수 있다 (5장).
 */

const knex = require("./knex.js");

// 7장 "초기 추천값"
const WEIGHTS = {
  relevance: 45,
  popularity: 25,
  freshness: 30,
};
const P_REF = 50; // 5장: 인기도 정규화 기준값
const TIE_EPSILON = 3; // 6장: 최종점수 차이가 이 값 이하이면 더 최신 글 우선

/**
 * RelationBase(u, writer_id(p)) - 기획서 4-1.
 * follow(user_id, friend_id) 테이블 기준 단방향/양방향 팔로우 관계 점수.
 * 바인딩 순서: [ourid, ourid, ourid, ourid, ourid] (총 5개)
 */
function relationBaseSQL(outerRef) {
  const writerCol = `${outerRef}.writer_id`;
  return `
    CASE
      WHEN ${writerCol} = ? THEN 1.00
      WHEN EXISTS(SELECT 1 FROM follow rb1 WHERE rb1.user_id = ? AND rb1.friend_id = ${writerCol})
       AND EXISTS(SELECT 1 FROM follow rb2 WHERE rb2.user_id = ${writerCol} AND rb2.friend_id = ?)
        THEN 1.00
      WHEN EXISTS(SELECT 1 FROM follow rb3 WHERE rb3.user_id = ? AND rb3.friend_id = ${writerCol})
        THEN 0.85
      WHEN EXISTS(SELECT 1 FROM follow rb4 WHERE rb4.user_id = ${writerCol} AND rb4.friend_id = ?)
        THEN 0.55
      ELSE 0.00
    END
  `;
}

/**
 * InteractionRaw(u, writer) - 기획서 4-2.
 * u가 writer의 글에 보낸 좋아요(x1)/댓글(x2)/인용(x3)을 집계한다.
 * 바인딩 순서: [ourid(like), ourid(comment), ourid(quote-talk), ourid(quote-think), ourid(quote-comment)] (총 5개)
 */
function interactionRawSQL(outerRef) {
  const writerCol = `${outerRef}.writer_id`;
  return `
    (
      (SELECT COUNT(*) FROM post_like ib_pl
         LEFT JOIN talk ib_lt ON ib_pl.type = 0 AND ib_pl.post_id = ib_lt.talk_num
         LEFT JOIN think ib_lh ON ib_pl.type = 1 AND ib_pl.post_id = ib_lh.think_num
       WHERE ib_pl.user_id = ?
         AND COALESCE(ib_lt.writer_id, ib_lh.writer_id) = ${writerCol}) * 1
      +
      (SELECT COUNT(*) FROM comment ib_cm
         LEFT JOIN talk ib_ct ON ib_cm.type = 0 AND ib_cm.post_num = ib_ct.talk_num
         LEFT JOIN think ib_ch ON ib_cm.type = 1 AND ib_cm.post_num = ib_ch.think_num
       WHERE ib_cm.writer_id = ?
         AND COALESCE(ib_ct.writer_id, ib_ch.writer_id) = ${writerCol}) * 2
      +
      (
        (SELECT COUNT(*) FROM talk ib_qt
           LEFT JOIN talk ib_qtt ON ib_qt.quote_type = 0 AND ib_qt.quote = ib_qtt.talk_num
           LEFT JOIN think ib_qth ON ib_qt.quote_type = 1 AND ib_qt.quote = ib_qth.think_num
         WHERE ib_qt.writer_id = ?
           AND COALESCE(ib_qtt.writer_id, ib_qth.writer_id) = ${writerCol})
        +
        (SELECT COUNT(*) FROM think ib_qh
           LEFT JOIN talk ib_qht ON ib_qh.quote_type = 0 AND ib_qh.quote = ib_qht.talk_num
           LEFT JOIN think ib_qhh ON ib_qh.quote_type = 1 AND ib_qh.quote = ib_qhh.think_num
         WHERE ib_qh.writer_id = ?
           AND COALESCE(ib_qht.writer_id, ib_qhh.writer_id) = ${writerCol})
        +
        (SELECT COUNT(*) FROM comment ib_qc
           LEFT JOIN talk ib_qct ON ib_qc.quote_type = 0 AND ib_qc.quote = ib_qct.talk_num
           LEFT JOIN think ib_qch ON ib_qc.quote_type = 1 AND ib_qc.quote = ib_qch.think_num
         WHERE ib_qc.writer_id = ?
           AND COALESCE(ib_qct.writer_id, ib_qch.writer_id) = ${writerCol})
      ) * 3
    )
  `;
}

/**
 * RelevanceScore(u,p) = min(1, RelationBase + InteractionBonus), InteractionBonus = min(0.25, raw/20)
 * 바인딩 총 10개 (relationBase 5 + interactionRaw 5)
 */
function relevanceScoreSQL(outerRef) {
  return `LEAST(1, (${relationBaseSQL(outerRef)}) + LEAST(0.25, (${interactionRawSQL(outerRef)}) / 20))`;
}

/**
 * PopularityScore(p) - 기획서 5장.
 * raw = like*1 + comment*2 + quote_num*3, 로그 정규화. 바인딩 없음 (게시글 자체 카운터 컬럼만 사용).
 */
function popularityScoreSQL(outerRef) {
  const raw = `((${outerRef}.\`like\` * 1) + (${outerRef}.comment * 2) + (${outerRef}.quote_num * 3))`;
  return `LEAST(1, LOG(1 + ${raw}) / LOG(1 + ${P_REF}))`;
}

/**
 * FreshnessScore(p) - 기획서 6장 계단식 감쇠. 바인딩 없음.
 */
function freshnessScoreSQL(outerRef) {
  const ts = `${outerRef}.timestamp`;
  return `
    CASE
      WHEN TIMESTAMPDIFF(MINUTE, ${ts}, NOW()) <= 10 THEN 1.00
      WHEN TIMESTAMPDIFF(HOUR, ${ts}, NOW()) <= 1 THEN 0.93
      WHEN TIMESTAMPDIFF(HOUR, ${ts}, NOW()) <= 3 THEN 0.80
      WHEN TIMESTAMPDIFF(HOUR, ${ts}, NOW()) <= 6 THEN 0.67
      WHEN TIMESTAMPDIFF(HOUR, ${ts}, NOW()) <= 12 THEN 0.53
      WHEN TIMESTAMPDIFF(HOUR, ${ts}, NOW()) <= 24 THEN 0.40
      WHEN TIMESTAMPDIFF(DAY, ${ts}, NOW()) <= 3 THEN 0.27
      WHEN TIMESTAMPDIFF(DAY, ${ts}, NOW()) <= 7 THEN 0.13
      ELSE 0.03
    END
  `;
}

/**
 * FinalScore(u,p) = 45*Relevance + 25*Popularity + 30*Freshness  (기획서 7장)
 *
 * @param {string} outerRef - 바깥 쿼리에서 게시글이 조회되는 테이블 별칭 (예: "p")
 * @param {number} ourid    - 현재 로그인한 사용자의 내부 id (profile.id)
 * @returns {object} knex.raw 인스턴스. .select(...).orderByRaw(...) 등에 바로 사용 가능.
 */
function buildFinalScoreRaw(outerRef, ourid) {
  const sql = `
    (
      (${WEIGHTS.relevance} * (${relevanceScoreSQL(outerRef)}))
      + (${WEIGHTS.popularity} * (${popularityScoreSQL(outerRef)}))
      + (${WEIGHTS.freshness} * (${freshnessScoreSQL(outerRef)}))
    )
  `;
  // relevanceScoreSQL 안에서 ourid 바인딩이 총 10번 등장한다 (relationBase 5 + interactionRaw 5).
  const bindings = new Array(10).fill(ourid);
  return knex.raw(sql, bindings);
}

/**
 * 후보 게시글(CandidatePosts) 필터 - 기획서 8장.
 * 최근 N일 게시글 + 내가 팔로우하는 사람의 글 + 나를 팔로우하는 사람의 글 +
 * 과거에 내가 반응(좋아요/댓글/인용)한 사람의 글 + 내가 쓴 글.
 *
 * @param {string} outerRef
 * @param {number} ourid
 * @param {number} recentDays - 기획서 8장 초기 추천값: 7일
 */
function buildCandidateWhereRaw(outerRef, ourid, recentDays = 7) {
  const writerCol = `${outerRef}.writer_id`;
  const sql = `
    (
      ${writerCol} = ?
      OR ${writerCol} IN (SELECT friend_id FROM follow WHERE user_id = ?)
      OR ${writerCol} IN (SELECT user_id FROM follow WHERE friend_id = ?)
      OR ${writerCol} IN (
        SELECT writer_id FROM (
          SELECT COALESCE(cw_lt.writer_id, cw_lh.writer_id) AS writer_id
          FROM post_like cw_pl
          LEFT JOIN talk cw_lt ON cw_pl.type = 0 AND cw_pl.post_id = cw_lt.talk_num
          LEFT JOIN think cw_lh ON cw_pl.type = 1 AND cw_pl.post_id = cw_lh.think_num
          WHERE cw_pl.user_id = ?
          UNION
          SELECT COALESCE(cw_ct.writer_id, cw_ch.writer_id) AS writer_id
          FROM comment cw_cm
          LEFT JOIN talk cw_ct ON cw_cm.type = 0 AND cw_cm.post_num = cw_ct.talk_num
          LEFT JOIN think cw_ch ON cw_cm.type = 1 AND cw_cm.post_num = cw_ch.think_num
          WHERE cw_cm.writer_id = ?
          UNION
          SELECT COALESCE(cw_qtt.writer_id, cw_qth.writer_id) AS writer_id
          FROM talk cw_qt
          LEFT JOIN talk cw_qtt ON cw_qt.quote_type = 0 AND cw_qt.quote = cw_qtt.talk_num
          LEFT JOIN think cw_qth ON cw_qt.quote_type = 1 AND cw_qt.quote = cw_qth.think_num
          WHERE cw_qt.writer_id = ?
          UNION
          SELECT COALESCE(cw_qht.writer_id, cw_qhh.writer_id) AS writer_id
          FROM think cw_qh
          LEFT JOIN talk cw_qht ON cw_qh.quote_type = 0 AND cw_qh.quote = cw_qht.talk_num
          LEFT JOIN think cw_qhh ON cw_qh.quote_type = 1 AND cw_qh.quote = cw_qhh.think_num
          WHERE cw_qh.writer_id = ?
          UNION
          SELECT COALESCE(cw_qct.writer_id, cw_qch.writer_id) AS writer_id
          FROM comment cw_qc
          LEFT JOIN talk cw_qct ON cw_qc.quote_type = 0 AND cw_qc.quote = cw_qct.talk_num
          LEFT JOIN think cw_qch ON cw_qc.quote_type = 1 AND cw_qc.quote = cw_qch.think_num
          WHERE cw_qc.writer_id = ?
        ) AS interacted_writers
        WHERE writer_id IS NOT NULL
      )
      OR ${outerRef}.timestamp >= (NOW() - INTERVAL ? DAY)
    )
  `;
  const bindings = [ourid, ourid, ourid, ourid, ourid, ourid, ourid, ourid, recentDays];
  return knex.raw(sql, bindings);
}

/** 6장: 최종점수 차이가 TIE_EPSILON 이하면 더 최신 글을 우선하기 위한 정렬용 버킷 표현식. */
function tieBreakBucketSQL(finalScoreAlias) {
  return `FLOOR(${finalScoreAlias} / ${TIE_EPSILON})`;
}

module.exports = {
  WEIGHTS,
  P_REF,
  TIE_EPSILON,
  buildFinalScoreRaw,
  buildCandidateWhereRaw,
  tieBreakBucketSQL,
};
