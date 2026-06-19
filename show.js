const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { user_id_to_id, islikeandbookmark, define_id, getOriginalPostWriterId } = require("./general.js");
const { buildPostResponse } = require("./postSerializer.js");
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

// 대상 유저가 요청자를 차단했는지, 팔로우/팔로워 목록을 비공개로 설정했는지 확인합니다.
// 본인이 본인 목록을 조회하는 경우에는 차단/비공개 설정과 무관하게 항상 조회를 허용합니다.
// GET /show/comment/:comment_id의 차단 처리(403 + code "4031")와 동일한 컨벤션을 따릅니다.
async function getFollowListAccess(targetId, req, res) {
    let requester_id = null;
    if (req.headers.authorization) {
        requester_id = await define_id(req.headers.authorization, res);
        if (res.headersSent) return null; // define_id가 이미 에러 응답을 보냄
    }
    if (requester_id != null && Number(requester_id) === Number(targetId)) {
        return { blocked: false, hidden: false };
    }
    if (requester_id != null) {
        // 양방향 차단 체크: 상대가 나를 차단했거나, 내가 상대를 차단한 경우 모두 차단으로 처리
        const blocked = await knex("block_list")
            .where(function () {
                this.where({ user_id: targetId, blocked_user_id: requester_id, type: 0 })
                    .orWhere({ user_id: requester_id, blocked_user_id: targetId, type: 0 });
            })
            .first();
        if (blocked) {
            return { blocked: true, hidden: false };
        }
    }
    const profile = await knex("profile").where("id", targetId).select("hide_follow_list").first();
    return { blocked: false, hidden: Boolean(profile && profile.hide_follow_list) };
}

router.get("/follow/:user_id", async (req, res) => {
    const ourid = await user_id_to_id(req.params.user_id)
    if (ourid == undefined) {
        return res.status(404).json({ msg: "존재하지 않는 유저입니다" });
    }
    const access = await getFollowListAccess(ourid, req, res);
    if (res.headersSent) return;
    if (access.blocked) {
        return res.status(403).json({ msg: "팔로우 목록을 조회할 수 없습니다.", code: "4031" });
    }
    if (access.hidden) {
        return res.json([]);
    }
    const list = await knex("follow").leftJoin("profile", "follow.friend_id", "profile.id").where("follow.user_id", ourid).select("profile.nickname", "profile.user_id", "profile.image");
    res.json(list);
})

router.get("/follower/:user_id", async (req, res) => {
    try {
        const ourid = await user_id_to_id(req.params.user_id);

        if (!ourid) {
            return res.status(404).json({ msg: "존재하지 않는 유저입니다" });
        }

        const access = await getFollowListAccess(ourid, req, res);
        if (res.headersSent) return;
        if (access.blocked) {
            return res.status(403).json({ msg: "팔로워 목록을 조회할 수 없습니다.", code: "4031" });
        }
        if (access.hidden) {
            return res.json([]);
        }

        // 단 한 번의 쿼리로 프로필 정보와 맞팔로우 상태를 가져옵니다.
        const list = await knex("follow")
            .leftJoin("profile", "follow.user_id", "profile.id")
            .where("follow.friend_id", ourid)
            .select(
                "profile.nickname",
                "profile.user_id",
                "profile.image",
                // 서브쿼리: 현재 유저(ourid)가 이 팔로워(follow.user_id)를 팔로우하고 있는지 확인
                knex.raw(
                    "EXISTS(SELECT 1 FROM follow AS f2 WHERE f2.user_id = ? AND f2.friend_id = follow.user_id) AS is_follow",
                    [ourid]
                )
            );

        // SQLite나 MySQL에 따라 exists 결과가 0/1 또는 boolean일 수 있으므로 포맷팅
        const result = list.map(item => ({
            ...item,
            is_follow: item.is_follow ? 1 : 0
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: "서버 에러가 발생했습니다" });
    }
})

router.get("/like/:type/:post_id", async (req, res) => {
    const type = req.params.type == "free" ? 0 : (req.params.type == "serious" ? 1 : 2);
    const page = req.query.page || 0;
    const list = await knex("post_like").leftJoin("profile", "post_like.user_id", "profile.id").where({ "post_like.type": type, "post_like.post_id": req.params.post_id }).select("profile.nickname", "profile.user_id", "profile.image").limit(10)
        .offset(page * 10);
    res.json(list);

});

router.get("/comment/:comment_id", async (req, res) => {
    let requester_id = null;
    if (req.headers.authorization) {
        requester_id = await define_id(req.headers.authorization, res);
        if (res.headersSent) return;
    }

    const content = await knex("comment as p").leftJoin("profile", "p.user_id", "profile.user_id").select("p.*", "p.comment_num AS comment_id", "profile.nickname", "profile.image", "profile.id as writer_profile_id").where("p.comment_num", req.params.comment_id).first();
    if (content) {
        if (requester_id) {
            const blocked = await knex("block_list")
                .where(function () {
                    this.where({ user_id: content.writer_profile_id, blocked_user_id: requester_id, type: 0 })
                        .orWhere({ user_id: requester_id, blocked_user_id: content.writer_profile_id, type: 0 });
                })
                .first();
            if (blocked) {
                return res.status(403).json({ msg: "댓글을 조회할 수 없습니다.", code: "4031" });
            }
        }
        const originalWriterId = await getOriginalPostWriterId(content.type, content.post_num);
        content.is_post_writer = originalWriterId != null && Number(content.writer_profile_id) === Number(originalWriterId);
        delete content.comment_num;
        delete content.writer_profile_id;
    }
    res.json(content);
});

router.get("/quotes/:type/:post_id", async (req, res) => {
    const type = req.params.type == "free" ? 0 : (req.params.type == "serious" ? 1 : 2);
    const page = req.query.page || 0;

    // 로그인한 경우 투표 여부 등 사용자 상태 반영
    let userId = null;
    if (req.headers.authorization) {
        userId = await define_id(req.headers.authorization, res);
    }

    const [list1, list2, list3] = await Promise.all([
        knex("talk as p")
            .leftJoin("profile", "p.writer_id", "profile.id")
            .where({ quote_type: type, quote: req.params.post_id, 'p.draft': 0 })
            .select('p.*', "profile.nickname", "profile.image as profile_image", ...islikeandbookmark(userId, "talk", 0))
            .limit(10).offset(page * 10),
        knex("think as p")
            .leftJoin("profile", "p.writer_id", "profile.id")
            .where({ quote_type: type, quote: req.params.post_id, 'p.draft': 0 })
            .select('p.*', "profile.nickname", "profile.image as profile_image", ...islikeandbookmark(userId, "think", 1))
            .limit(10).offset(page * 10),
        knex("comment as p")
            .leftJoin("profile", "p.user_id", "profile.user_id")
            .where({ quote_type: type, quote: req.params.post_id })
            .select('p.*', "profile.nickname", "profile.image as profile_image", ...islikeandbookmark(userId, "comment", 2))
            .limit(10).offset(page * 10),
    ]);

    // comment는 게시물(talk/think)과 스키마가 달라 별도로 반환
    const posts = await buildPostResponse([...list1, ...list2], userId);
    res.json({ posts, comments: list3 });
});


module.exports = router;
