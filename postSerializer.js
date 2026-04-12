/**
 * postSerializer.js
 *
 * 게시물(talk / think) 관련 공통 직렬화 모듈입니다.
 *
 * ★ 게시물에 새 필드를 추가하거나 응답 형태를 변경할 때는
 *   serializePost() 함수만 수정하면 됩니다.
 *   home / 글세부 / 라이브러리 / 검색 등 모든 API에 자동 반영됩니다. ★
 *
 * 사용법:
 *   const { buildPostResponse } = require('./postSerializer');
 *
 *   // 단일 게시물
 *   return res.json(await buildPostResponse(post, userId));
 *
 *   // 배열
 *   return res.json(await buildPostResponse(posts, userId));
 */

const knex = require('./knex');

// ---------------------------------------------------------------------------
// 투표 정보 첨부
// ---------------------------------------------------------------------------

/**
 * 게시물(단일 또는 배열)에 vote_info 를 첨부합니다.
 *
 * vote_info 구조
 *  - 투표 전 / 진행 중  : { vote_1~6: "선택지 텍스트", end_date, is_ended: false, user_choice: null }
 *  - 투표 후 / 종료 후  : { vote_1~6: 투표수(숫자),   end_date, is_ended, user_choice: 선택번호|null }
 *  - 투표 없는 게시물   : vote_info = null
 *
 * @param {Object|Object[]} posts  - DB에서 조회한 게시물(배열)
 * @param {number|null}     userId - 현재 사용자의 내부 ID (비로그인 시 null)
 */
/*
async function attachVoteInfo(posts, userId) {
    const isSingle = !Array.isArray(posts);
    const arr = isSingle ? [posts] : posts;

    // vote 필드가 있는 게시물의 vote_num 수집 (중복 제거)
    const voteIds = [...new Set(
        arr.filter(p => p != null && p.vote != null).map(p => p.vote)
    )];

    if (voteIds.length === 0) {
        arr.forEach(p => { if (p) p.vote_info = null; });
        return isSingle ? arr[0] : arr;
    }

    // 투표 기본 정보 · 결과 · 사용자 선택을 한 번에 병렬 조회
    const [voteInfos, voteResults, userChoices] = await Promise.all([
        knex('vote').whereIn('vote_num', voteIds).select('*'),
        knex('v_vote_results').whereIn('vote_num', voteIds).select('*'),
        userId
            ? knex('vote_count')
                .whereIn('vote_num', voteIds)
                .where('our_id', userId)
                .select('vote_num', 'point')
            : Promise.resolve([]),
    ]);

    const voteInfoMap   = new Map(voteInfos.map(v => [v.vote_num, v]));
    const voteResultMap = new Map(voteResults.map(v => [v.vote_num, v]));
    const userChoiceMap = new Map(userChoices.map(v => [v.vote_num, v.point]));

    arr.forEach(post => {
        if (post == null || post.vote == null) {
            if (post) post.vote_info = null;
            return;
        }

        const info = voteInfoMap.get(post.vote);
        if (!info) { post.vote_info = null; return; }

        const isEnded  = new Date(info.end_date) < new Date();
        const hasVoted = userId != null && userChoiceMap.has(post.vote);

        if (hasVoted || isEnded) {
            // 투표 완료 또는 종료 → v_vote_results 의 집계 수치를 반환
            const result = voteResultMap.get(post.vote) || {};
            post.vote_info = {
                vote_1:      result.vote_1 ?? null,
                vote_2:      result.vote_2 ?? null,
                vote_3:      result.vote_3 ?? null,
                vote_4:      result.vote_4 ?? null,
                vote_5:      result.vote_5 ?? null,
                vote_6:      result.vote_6 ?? null,
                end_date:    info.end_date,
                is_ended:    isEnded,
                user_choice: hasVoted ? userChoiceMap.get(post.vote) : null,
            };
        } else {
            // 아직 투표 전 → 선택지 텍스트만 반환
            post.vote_info = {
                vote_1:      info.vote_1,
                vote_2:      info.vote_2,
                vote_3:      info.vote_3 ?? null,
                vote_4:      info.vote_4 ?? null,
                vote_5:      info.vote_5 ?? null,
                vote_6:      info.vote_6 ?? null,
                end_date:    info.end_date,
                is_ended:    false,
                user_choice: null,
            };
        }
    });

    return isSingle ? arr[0] : arr;
}
*/

// ---------------------------------------------------------------------------
// 직렬화
// ---------------------------------------------------------------------------

/**
 * DB row 하나를 API 응답 형태로 정규화합니다.
 *
 * ★ 필드를 추가·수정할 때는 이 함수만 고치면 됩니다. ★
 *
 * @param {Object} post - attachVoteInfo 가 적용된 DB row
 * @returns {Object}    - 클라이언트에 내려갈 게시물 객체
 */
function serializePost(post) {
    return {
        // --- 식별 ---
        id: post.talk_num ?? post.think_num,
        type: post.talk_num != null ? 'talk' : 'think',
        ...(post.talk_num != null ? { talk_num: post.talk_num } : {}),
        ...(post.think_num != null ? { think_num: post.think_num } : {}),

        // --- 게시물 본문 ---
        writer_id: post.writer_id,
        user_id: post.user_id ?? null,
        header: post.header ?? null,
        subject: post.subject ?? null,
        photo: post.photo ?? null,
        timestamp: post.timestamp,

        // --- 인용 ---
        quote: post.quote ?? null,
        quote_type: post.quote_type ?? null,
        quote_num: post.quote_num ?? 0,

        // --- 통계 ---
        like: post.like ?? 0,
        comment: post.comment ?? 0,
        views: post.views ?? 0,
        mylist: post.mylist ?? 0,

        // --- 작성자 프로필 ---
        nickname: post.nickname ?? null,
        profile_image: post.profile_image ?? null,

        // --- 내 활동 여부 ---
        is_like: Boolean(post.is_like),
        is_bookmark: Boolean(post.is_bookmark),

        // ★ 새 필드 추가 시 여기만 수정 ★
        vote: post.vote ?? null,
    };
}

function serializePosts(posts) {
    return posts.map(serializePost);
}

// ---------------------------------------------------------------------------
// 통합 헬퍼 (각 API 핸들러에서 사용)
// ---------------------------------------------------------------------------

/**
 * 게시물(단일 또는 배열)에 투표 정보를 첨부하고 직렬화까지 수행합니다.
 * 모든 게시물 관련 API 핸들러의 마지막에서 이 함수 하나만 호출하세요.
 *
 * @example
 *   return res.json(await buildPostResponse(posts, ourid));
 *
 * @param {Object|Object[]} posts  - DB 조회 결과
 * @param {number|null}     userId - 현재 사용자의 내부 ID
 * @returns {Promise<Object|Object[]>}
 */
async function buildPostResponse(posts, userId) {
    const isSingle = !Array.isArray(posts);
    const arr = isSingle ? [posts] : posts;

    await attachVoteInfo(arr, userId);

    const serialized = arr.map(serializePost);
    return isSingle ? serialized[0] : serialized;
}

module.exports = { serializePost, serializePosts, buildPostResponse };
