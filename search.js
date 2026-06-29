const express = require("express");
const router = express.Router();
const defind_id = require('./general.js').define_id;
const knex = require("./knex.js");

const { stream } = require("./log.js");
const morgan = require("morgan");
const { user_id_to_id, islikeandbookmark, iscommentandquote, getBlockedIds } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post("/", async (req, res) => {
    let tmp = req.headers.authorization;
    const page = req.body.page || 0;
    let id = null;
    if (tmp) {
        id = await defind_id(tmp, res);
    }
    if (req.body.type == "talk") {
        const talk = await knex('talk as p')
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('p.header', 'like', `%${req.body.searchparam}%`)
                    .orWhere('p.subject', 'like', `%${req.body.searchparam}%`);
            })
            .whereNull('p.deleted_at')
            .leftJoin("profile", "p.writer_id", "profile.id")
            .select('p.*', 'profile.user_id as user_id', 'profile.nickname', 'profile.image as profile_image', ...islikeandbookmark(id, "talk", 0), ...iscommentandquote(id, "talk", 0, "is_comment", "p"))
            .limit(10).offset(page * 10);
        return res.json(await buildPostResponse(talk, id));
    }
    if (req.body.type == "think") {
        const think = await knex('think as p')
            .whereNotIn('p.writer_id', function () {
                this.select('blocked_user_id')
                    .from('block_list')
                    .where('user_id', id);
            })
            .andWhere(function () {
                this.where('p.header', 'like', `%${req.body.searchparam}%`)
                    .orWhere('p.subject', 'like', `%${req.body.searchparam}%`);
            })
            .whereNull('p.deleted_at')
            .leftJoin("profile", "p.writer_id", "profile.id")
            .select('p.*', 'profile.user_id as user_id', 'profile.nickname', 'profile.image as profile_image', ...islikeandbookmark(id, "think", 1), ...iscommentandquote(id, "think", 1, "is_comment", "p"))
            .limit(10)
            .offset(page * 10);
        return res.json(await buildPostResponse(think, id));
    }
    if (req.body.type == "user") {
        // 입력값 검증: 문자열이 아니거나 비어있으면 빈 결과로 응답 (검증되지 않은 입력으로 쿼리를 만들지 않음)
        const rawParam = typeof req.body.searchparam === "string" ? req.body.searchparam.trim() : "";
        if (!rawParam) {
            return res.json([]);
        }
        // 비정상적으로 긴 입력으로 인한 자원 낭비 방지
        const safeParam = rawParam.slice(0, 30);
        // LIKE 와일드카드(%, _, \)를 리터럴로 escape: 사용자 입력이 의도치 않게 와일드카드로 동작하지 않도록 함
        const escapedParam = safeParam.replace(/[\\%_]/g, (m) => `\\${m}`);
        // page는 음수/비정상 값이 들어와도 안전하게 0 이상의 정수로 고정
        const safePage = Number.isInteger(page) && page > 0 ? page : 0;

        // 차단 관계는 양방향으로 확인 (내가 차단했거나 상대가 나를 차단한 경우 모두 제외)
        const blockedIds = id ? await getBlockedIds(id) : [];

        const user = await knex('profile')
            .whereNotIn('id', blockedIds.length ? blockedIds : [-1])
            .andWhere(function () {
                this.where('user_id', 'like', `%${escapedParam}%`)
                    .orWhere('nickname', 'like', `%${escapedParam}%`);
            })
            .select(
                'nickname',
                'image as profile_image',
                'user_id',
                // 맞팔(서로 팔로우) 여부: 내가 상대를 팔로우하고, 상대도 나를 팔로우하는 경우만 true
                knex.raw(
                    `(
                        EXISTS (SELECT 1 FROM follow f1 WHERE f1.user_id = ? AND f1.friend_id = profile.id)
                        AND
                        EXISTS (SELECT 1 FROM follow f2 WHERE f2.user_id = profile.id AND f2.friend_id = ?)
                    ) AS is_mutual_follow`,
                    [id, id]
                ),
                // 일치 정도: user_id/nickname 중 더 잘 맞는 쪽 기준 (완전 일치(0) > 입력값으로 시작(1) > 포함(2) > 미일치(3))
                knex.raw(
                    `LEAST(
                        CASE WHEN user_id = ? THEN 0 WHEN user_id LIKE ? THEN 1 WHEN user_id LIKE ? THEN 2 ELSE 3 END,
                        CASE WHEN nickname = ? THEN 0 WHEN nickname LIKE ? THEN 1 WHEN nickname LIKE ? THEN 2 ELSE 3 END
                    ) AS match_rank`,
                    [
                        safeParam, `${escapedParam}%`, `%${escapedParam}%`,
                        safeParam, `${escapedParam}%`, `%${escapedParam}%`,
                    ]
                ),
                // 일치하는 부분의 시작 위치(앞쪽일수록 더 일치). 미일치(0)는 가장 뒤로 보내기 위해 큰 값(999)으로 치환
                knex.raw(
                    `LEAST(
                        CASE WHEN LOCATE(?, user_id) = 0 THEN 999 ELSE LOCATE(?, user_id) END,
                        CASE WHEN LOCATE(?, COALESCE(nickname, '')) = 0 THEN 999 ELSE LOCATE(?, COALESCE(nickname, '')) END
                    ) AS match_pos`,
                    [safeParam, safeParam, safeParam, safeParam]
                ),
                // 같은 등수일 때는 더 짧은(불필요한 글자가 적은) 쪽을 우선
                knex.raw(`LEAST(CHAR_LENGTH(user_id), CHAR_LENGTH(COALESCE(nickname, ''))) AS id_len`)
            )
            .orderBy([
                { column: 'is_mutual_follow', order: 'desc' },
                { column: 'match_rank', order: 'asc' },
                { column: 'match_pos', order: 'asc' },
                { column: 'id_len', order: 'asc' },
            ])
            .limit(10)
            .offset(safePage * 10);
        return res.json(user);
    }
})

module.exports = router;