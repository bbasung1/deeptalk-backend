const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const convert_our_id = require('./general.js').define_id;
const id_to_user_id = require('./general.js').id_to_user_id;
const add_nickname = require('./general.js').add_nickname;
const { sendPostNotification } = require('./fcm.js');
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename } = require("./utils/imageSaver");

const { stream } = require("./log.js");
const morgan = require("morgan");
router.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

router.use(express.json());

router.post("/", upload.single("file"), async (req, res) => {
    const { mode, header, subject, type, post_num, quote_num, quote_type } = req.body;
    console.log(req.body);
    const trx = await knex.transaction();
    
    // mode가 "comment"인 경우 댓글 작성 처리
    if (mode === "comment") {
        if (!type || !post_num || !subject) {
            return res.status(400).json({ success: false, message: "type, post_num, subject 모두 필요합니다." });
        }

        if (![0, 1].includes(parseInt(type))) {
            return res.status(400).json({ success: false, message: "type은 0(talk), 1(think) 중 하나여야 합니다." });
        }

        try {
            const writer_id = await convert_our_id(req.headers.authorization, res);
            if (!writer_id) {
                return res.status(404).json({ success: false, message: "user_id에 해당하는 profile이 없습니다." });
            }

            // 게시글 존재 여부 확인
            const targetTable = type == 0 ? "talk" : "think";
            const postColumn = type == 0 ? "talk_num" : "think_num";

            const post = await trx(targetTable)
                .where(postColumn, post_num)
                .select(knex.raw("1"))
                .first();

            if (!post) {
                await trx.rollback();
                return res.status(404).json({
                    success: false,
                    message: `해당 ${type == 0 ? "talk" : "think"} 게시글(post_num=${post_num})이 존재하지 않습니다.`
                });
            }

            // 댓글 작성자의 user_id 존재 확인
            const user = await trx("profile")
                .where("id", writer_id)
                .select("user_id")
                .first();

            if (!user) {
                await trx.rollback();
                return res.status(404).json({
                    success: false,
                    message: "댓글 작성자 user_id가 존재하지 않습니다."
                });
            }

            // 이미지 처리
            let filename = null;
            if (req.file) {
                const ext = req.file.originalname.split(".").pop();
                filename = generateFilename(ext);
                await saveImage(req.file.buffer, filename);
            }

            // 인용 처리
            let quote = null;
            let quote_type_val = null;
            if (quote_num) {
                try {
                    const quote_table = quote_type == "Jam-Talk" ? "talk" : (quote_type == "Jin-Talk" ? "think" : "comment");
                    quote = quote_num;
                    quote_type_val = quote_table == "talk" ? 0 : (quote_table == "think" ? 1 : 2);
                    const { quote_num: existing_quote_num } = await trx(quote_table).select("quote_num").where(`${quote_table}_num`, quote_num).first();
                    await trx(quote_table).update({ "quote_num": existing_quote_num + 1 }).where(`${quote_table}_num`, quote_num);
                } catch (err) {
                    await trx.rollback();
                    console.error("인용 과정에서 문제가 발생했습니다");
                    return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." });
                }
            }

            // 댓글 삽입
            const [comment_num] = await trx("comment").insert({
                type: parseInt(type),
                post_num: parseInt(post_num),
                subject,
                header: header || null,
                writer_id: writer_id,
                user_id: user.user_id,
                reported: 0,
                like: 0,
                quote: 0,
                comment: 0,
                mylist: 0,
                views: 0,
                photo: filename,
                quote_num: quote,
                quote_type: quote_type_val
            });

            await trx.commit();
            res.status(201).json({
                success: true,
                message: "댓글이 등록되었습니다.",
                comment_num
            });
        } catch (err) {
            await trx.rollback();
            console.error(err);
            res.status(500).json({ success: false, message: "댓글 등록 중 서버 오류가 발생했습니다." });
        }
        return;
    }

    // 기존 게시글 작성 로직
    if (!mode || !header || !subject) {
        return res.status(400).json({ success: false, message: "모든 필드를 입력해주세요." });
    }

    if (!["Jam-Talk", "Jin-Talk"].includes(mode)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
    }

    try {
        const writer_id = await convert_our_id(req.headers.authorization, res);  // 내부 ID로 변환
        // profile.user_id를 user.id로로
        if (!writer_id) {
            return res.status(404).json({ success: false, message: "user_id에 해당하는 profile이 없습니다." });
        }
        let filename = null;
        const table = (mode === "Jam-Talk") ? "talk" : "think";
        if (req.file) {
            const ext = req.file.originalname.split(".").pop();
            filename = generateFilename(ext);

            const savedPath = await saveImage(req.file.buffer, filename);
        }
        let quote = null;
        let quote_type = null;
        console.log(quote)
        if (req.body.quote_num) {
            try {
                const quote_table = req.body.quote_type == "Jam-Talk" ? "talk" : (req.body.quote_type == "Jin-Talk" ? "think" : "comment");
                quote = req.body.quote_num;
                quote_type = quote_table == "talk" ? 0 : (quote_table == "think" ? 1 : 2);
                const { quote_num, ...rest } = await trx(quote_table).select("quote_num").where(`${quote_table}_num`, req.body.quote_num).first();
                console.log(quote_num);
                await trx(quote_table).update({ "quote_num": quote_num + 1 }).where(`${quote_table}_num`, req.body.quote_num);
            } catch (err) {
                await trx.rollback();
                console.error("인용 과정에서 문제가 발생했습니다");
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." })
            }
        }
        const user_id = await id_to_user_id(writer_id);
        let [post_num] = await trx(table).insert({
            writer_id: writer_id,
            user_id: user_id,
            header: header,
            subject: subject,
            reported: 0, // 기본값: 신고되지 않음
            photo: filename,
            quote,
            quote_type
        });
        console.log(post_num);
        if (req.body.vote) {
            let post_type = (mode === "Jam-Talk") ? 0 : 1;
            if (req.body.vote.vote_1.length <= 0 || req.body.vote.vote_2.length <= 0) {
                console.log(req.body.vote.vote_1.length, req.body.vote.vote_2.length);
                await trx.rollback();
                return res.status(404).json({ success: false, message: "투표 항목은 2개 이상이어야 합니다." });
            }
            try {
                let [vote_num] = await trx("vote").insert({
                    post_type,
                    post_num,
                    vote_1: req.body.vote.vote_1,
                    vote_2: req.body.vote.vote_2,
                    vote_3: req.body.vote.vote_3 || null,
                    vote_4: req.body.vote.vote_4 || null,
                    vote_5: req.body.vote.vote_5 || null,
                    vote_6: req.body.vote.vote_6 || null,
                    end_date: toKstDatetime(req.body.vote.end_date)
                })
                const test = await trx(table).update({ vote: vote_num }).where(`${table}_num`, post_num);
                console.log("vote 가 진행됬는지 확인:" + test)
            } catch (err) {
                await trx.rollback();
                console.error(err);
                return res.status(500).json({ success: false, message: "투표 등록 중 오류가 발생했습니다." });
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

/**
 * ISO 문자열(UTC)을 KST(UTC+9) 기준의 MySQL DATETIME 문자열로 변환합니다.
 * DB 및 NOW()가 KST 기준이므로 저장 시 KST로 맞춰야 시간 비교가 정확합니다.
 *
 * "2026-04-15T01:30:00.000Z" → "2026-04-15 10:30:00"  (+9h)
 */
function toKstDatetime(isoString) {
    console.log("원본 ISO 문자열:", isoString);
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    // const KST_OFFSET_MS = 0;
    const kstDate = new Date(new Date(isoString).getTime() - KST_OFFSET_MS);
    console.log("KST DATETIME 문자열:", kstDate.toISOString().slice(0, 19).replace('T', ' '));
    return kstDate.toISOString().slice(0, 19).replace('T', ' ');
}


module.exports = router;