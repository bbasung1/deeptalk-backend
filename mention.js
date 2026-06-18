const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, getBlockedIds } = require("./general.js");
router.use(express.json());

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

// 나를 멘션한 기록 조회 (인증 필요, 본인 것만 조회 가능)
router.get("/", async (req, res) => {
    const my_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!my_id) {
        return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const page = Math.max(parseInt(req.query.page) || 0, 0);

    try {
        const blockedIds = await getBlockedIds(my_id);

        const mentions = await knex("mention as m")
            .join("profile as p", "m.mentioner_id", "p.id")
            .where("m.mentioned_id", my_id)
            .modify((qb) => {
                // 멘션 당시엔 차단 관계가 아니었어도, 현재 차단 관계라면 노출하지 않음
                if (blockedIds.length > 0) {
                    qb.whereNotIn("m.mentioner_id", blockedIds);
                }
            })
            .select(
                "m.id as mention_id",
                "m.post_type",
                "m.post_num",
                "m.timestamp",
                "m.is_read",
                "p.user_id as mentioner_user_id",
                "p.nickname as mentioner_nickname",
                "p.image as mentioner_profile_image"
            )
            .orderBy("m.timestamp", "desc")
            .limit(20)
            .offset(page * 20);

        return res.json({ success: true, mentions });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 멘션 읽음 처리 (본인 소유의 멘션만 처리 가능)
router.patch("/:mention_id/read", async (req, res) => {
    const my_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!my_id) {
        return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const mention_id = parseInt(req.params.mention_id);
    if (isNaN(mention_id)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 mention_id입니다." });
    }

    try {
        // 존재 여부와 소유권을 함께 확인 (다른 사람의 멘션을 추측해 변경하지 못하도록 동일한 404로 응답)
        const updated = await knex("mention")
            .where({ id: mention_id, mentioned_id: my_id })
            .update({ is_read: 1 });

        if (updated === 0) {
            return res.status(404).json({ success: false, message: "멘션을 찾을 수 없습니다." });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;
