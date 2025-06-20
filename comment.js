const express = require("express");
const router = express.Router();
const knex = require("./knex.js");

router.use(express.json());

router.post("/", async (req, res) => {
    const { user_id, type, post_num, subject } = req.body;

    if (!user_id || type === undefined || post_num === undefined || !subject) {
        return res.status(400).json({
            success: false,
            message: "user_id, type, post_num, subject 모두 필요합니다."
        });
    }

    if (![0, 1].includes(type)) {
        return res.status(400).json({
            success: false,
            message: "type은 0(talk), 1(think) 중 하나여야 합니다."
        });
    }

    try {
        // 🔍 게시글 존재 여부 확인
        const targetTable = type === 0 ? "talk" : "think";
        const postColumn = type === 0 ? "talk_num" : "think_num";

        const post = await knex(targetTable)
            .where(postColumn, post_num)
            .select(knex.raw("1"))
            .first();

        if (!post) {
            return res.status(404).json({
                success: false,
                message: `해당 ${type === 0 ? "talk" : "think"} 게시글(post_num=${post_num})이 존재하지 않습니다.`
            });
        }

        // ✅ 댓글 작성자의 user_id 존재 확인 (profile 테이블에서)
        const user = await knex("profile")
            .where("user_id", user_id)
            .select(knex.raw("1"))
            .first();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "댓글 작성자 user_id가 존재하지 않습니다."
            });
        }

        // ✅ 댓글 삽입
        await knex("comment").insert({
            type,
            post_num,
            subject,
            user_id
        });

        res.status(201).json({
            success: true,
            message: "댓글이 등록되었습니다."
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "댓글 등록 중 서버 오류가 발생했습니다."
        });
    }
});

module.exports = router;
