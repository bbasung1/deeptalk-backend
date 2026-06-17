const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, id_to_user_id, add_nickname, regist_file, regist_quote, regist_vote } = require('./general.js');
const { sendPostNotification } = require('./fcm.js');
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename, } = require("./utils/imageSaver");

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.use(express.json());

router.post("/", upload.array("files", 6), async (req, res) => {
    const { mode, subject } = req.body;
    console.log(req.body);
    const trx = await knex.transaction();
    if (!mode || !subject) {
        return res.status(400).json({ success: false, message: "모든 필드를 입력해주세요." });
    }

    if (!["Jam-Talk", "Jin-Talk"].includes(mode)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
    }

    try {
        const writer_id = await define_id(req.headers.authorization, res);  // 내부 ID로 변환
        // profile.user_id를 user.id로로
        if (!writer_id) {
            return res.status(404).json({ success: false, message: "user_id에 해당하는 profile이 없습니다." });
        }
        const table = (mode === "Jam-Talk") ? "talk" : "think";

        const photoFields = { photo: null, photo_1: null, photo_2: null, photo_3: null, photo_4: null, photo_5: null };
        if (req.files && req.files.length > 0) {
            const filenames = await Promise.all(req.files.map(f => regist_file(f)));
            photoFields.photo = filenames[0] ?? null;
            for (let i = 1; i <= 5; i++) {
                photoFields[`photo_${i}`] = filenames[i] ?? null;
            }
        }

        let quote = null;
        let quote_type = null;
        console.log(quote)
        let draft = req.body.draft ?? 0;
        if (req.body.quote && draft == 0) {
            try {
                ({ quote, quote_type } = await regist_quote(trx, req));
            } catch (err) {
                await trx.rollback();
                console.error("인용 과정에서 문제가 발생했습니다");
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." })
            }
        }
        const user_id = await id_to_user_id(writer_id);
        const header = req.body.header || null;
        let [post_num] = await trx(table).insert({
            writer_id: writer_id,
            user_id: user_id,
            header: header,
            subject: subject,
            reported: 0,
            ...photoFields,
            quote,
            quote_type,
            draft
        });
        console.log(post_num);
        if (req.body.vote) {
            let post_type = (mode === "Jam-Talk") ? 0 : (mode === "Jin-Talk") ? 1 : 2;
            try {
                await regist_vote(trx, { vote: req.body.vote, post_type, post_num, table: table })
            } catch (err) {
                await trx.rollback();
                const status = err.httpcode || 500;
                const message = err.message || "투표 등록 중 오류가 발생했습니다.";
                console.error(err);
                return res.status(status).json({ success: false, message });
            }
        }
        await trx.commit();
        res.status(201).json({ success: true, message: "글이 성공적으로 등록되었습니다." });

        // 팔로워에게 FCM 알림 발송 (응답 블로킹 방지를 위해 await 생략)
        const nickname = await add_nickname(writer_id);
        sendPostNotification(writer_id, nickname, mode);
    } catch (err) {
        await trx.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 내가 쓴 글의 반응(좋아요/댓글) 알림을 게시물 단위로 뮤트/해제
router.patch("/:mode/:id/mute", async (req, res) => {
    const { mode, id } = req.params;
    if (!["Jam-Talk", "Jin-Talk"].includes(mode)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
    }

    const post_id = parseInt(id);
    if (isNaN(post_id)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 id입니다." });
    }

    const writer_id = await define_id(req.headers.authorization, res);
    if (!writer_id) {
        return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    if (typeof req.body.mute === "undefined") {
        return res.status(400).json({ success: false, message: "mute 값이 필요합니다." });
    }
    const mute = (req.body.mute === true || req.body.mute === 1 || req.body.mute === "1") ? 1 : 0;

    const table = mode === "Jam-Talk" ? "talk" : "think";
    const idColumn = mode === "Jam-Talk" ? "talk_num" : "think_num";

    try {
        const existing = await knex(table).where(idColumn, post_id).select("writer_id").first();
        // 글이 없거나 내 글이 아닌 경우 동일하게 404로 응답 (존재 여부 추측 방지)
        if (!existing || existing.writer_id !== writer_id) {
            return res.status(404).json({ success: false, message: "글을 찾을 수 없습니다." });
        }

        await knex(table).where(idColumn, post_id).update({ notify_mute: mute });
        return res.json({
            success: true,
            notify_mute: Boolean(mute),
            message: mute ? "반응 알림을 뮤트했습니다." : "반응 알림 뮤트를 해제했습니다."
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;