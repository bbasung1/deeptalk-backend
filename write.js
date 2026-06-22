const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, id_to_user_id, add_nickname, regist_file, regist_quote, regist_vote, extractMentionedIds } = require('./general.js');
const { sendPostNotification, sendMentionNotification } = require('./fcm.js');
const { buildPostResponse } = require("./postSerializer.js");
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
            //user_id: user_id,
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
        res.status(201).json({ success: true, message: "글이 성공적으로 등록되었습니다.", id: post_num });

        // 팔로워에게 FCM 알림 발송 (응답 블로킹 방지를 위해 await 생략)
        const nickname = await add_nickname(writer_id);
        sendPostNotification(writer_id, nickname, mode);

        // 본문에 포함된 "@user_id" 멘션 처리 (응답 블로킹 방지를 위해 await 생략)
        const post_type = (mode === "Jam-Talk") ? 0 : 1;
        extractMentionedIds(subject, writer_id).then(async (mentionedIds) => {
            if (mentionedIds.length === 0) return;
            await knex("mention").insert(
                mentionedIds.map(mentioned_id => ({
                    mentioner_id: writer_id,
                    mentioned_id,
                    post_type,
                    post_num
                }))
            );
            sendMentionNotification({ mentionedIds, actorNickname: nickname });
        }).catch(err => console.error("멘션 처리 실패:", err));
    } catch (err) {
        await trx.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 게시물 수정
// - 게시한 글(draft=0): subject/header/사진만 수정 가능 (투표/인용은 잠금)
// - 이어서 게시하기(draft=1): 모든 필드 수정 가능 + draft=0 전송 시 게시로 전환
router.patch("/:mode/:id", upload.array("files", 6), async (req, res) => {
    const { mode, id } = req.params;
    if (!["Jam-Talk", "Jin-Talk"].includes(mode)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
    }

    const post_id = parseInt(id);
    if (isNaN(post_id)) {
        return res.status(400).json({ success: false, message: "유효하지 않은 id입니다." });
    }

    const writer_id = await define_id(req.headers.authorization, res);
    if (res.headersSent) return;
    if (!writer_id) {
        return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    const table = mode === "Jam-Talk" ? "talk" : "think";
    const idColumn = mode === "Jam-Talk" ? "talk_num" : "think_num";

    const trx = await knex.transaction();
    try {
        const post = await trx(table).where(idColumn, post_id).first();
        if (!post) {
            await trx.rollback();
            return res.status(404).json({ success: false, message: "글을 찾을 수 없습니다." });
        }
        // JWT sub는 문자열, DB writer_id는 숫자이므로 형변환 후 비교
        if (Number(post.writer_id) !== Number(writer_id)) {
            await trx.rollback();
            return res.status(403).json({ success: false, message: "수정 권한이 없습니다.", code: "4101" });
        }

        const updateFields = {};

        // subject / header: 공통으로 수정 가능
        if (typeof req.body.subject !== "undefined") {
            if (!req.body.subject) {
                await trx.rollback();
                return res.status(400).json({ success: false, message: "본문은 비워둘 수 없습니다." });
            }
            updateFields.subject = req.body.subject;
        }
        if (typeof req.body.header !== "undefined") {
            updateFields.header = req.body.header || null;
        }

        // 사진: 새 파일이 첨부되면 기존 사진을 교체, remove_photo=true면 기존 사진만 삭제,
        // 둘 다 아니면 기존 사진 유지
        const wantsRemovePhoto = ["true", "1"].includes(String(req.body.remove_photo));
        if (req.files && req.files.length > 0) {
            const filenames = await Promise.all(req.files.map(f => regist_file(f)));
            updateFields.photo = filenames[0] ?? null;
            for (let i = 1; i <= 5; i++) {
                updateFields[`photo_${i}`] = filenames[i] ?? null;
            }
        } else if (wantsRemovePhoto) {
            updateFields.photo = null;
            for (let i = 1; i <= 5; i++) {
                updateFields[`photo_${i}`] = null;
            }
        }

        const isDraft = post.draft == 1;
        const wantsPublish = req.body.draft === "0" || req.body.draft === 0 || req.body.draft === false;

        if (!isDraft) {
            // 이미 게시된 글: 투표/인용 변경은 허용하지 않음
            if (typeof req.body.vote !== "undefined" || typeof req.body.quote !== "undefined") {
                await trx.rollback();
                return res.status(400).json({ success: false, message: "게시된 글의 투표/인용은 수정할 수 없습니다." });
            }
        } else {
            // 드래프트: 인용 변경 (draft 상태이므로 quote_num은 아직 반영 전)
            if (typeof req.body.quote !== "undefined") {
                if (req.body.quote) {
                    const { quote, quote_type } = await regist_quote(trx, req);
                    updateFields.quote = quote;
                    updateFields.quote_type = quote_type;
                } else {
                    updateFields.quote = null;
                    updateFields.quote_type = null;
                }
            }

            // 드래프트: 투표 변경 (기존 투표가 있다면 교체. 미게시 상태라 투표자가 없어 안전)
            if (typeof req.body.vote !== "undefined") {
                if (post.vote) {
                    await trx("vote_count").where({ vote_num: post.vote }).delete();
                    await trx("vote").where({ vote_num: post.vote }).delete();
                    updateFields.vote = null;
                }
                if (req.body.vote) {
                    const post_type = mode === "Jam-Talk" ? 0 : 1;
                    await regist_vote(trx, { vote: req.body.vote, post_type, post_num: post_id, table });
                }
            }

            if (wantsPublish) {
                updateFields.draft = 0;

                // 이번 요청에서 새로 등록한 인용이 아니라, 드래프트 작성 시점부터 갖고 있던
                // 인용을 지금 게시하는 경우 -> 게시 시점에 quote_num 반영
                const quoteIsFresh = typeof req.body.quote !== "undefined";
                const finalQuote = quoteIsFresh ? updateFields.quote : post.quote;
                const finalQuoteType = quoteIsFresh ? updateFields.quote_type : post.quote_type;
                if (!quoteIsFresh && finalQuote) {
                    const quote_table = finalQuoteType == 0 ? "talk" : (finalQuoteType == 1 ? "think" : "comment");
                    const quote_col = `${quote_table}_num`;
                    const target = await trx(quote_table).select("quote_num").where(quote_col, finalQuote).first();
                    if (target) {
                        await trx(quote_table).update({ quote_num: target.quote_num + 1 }).where(quote_col, finalQuote);
                    }
                }
            }
        }

        if (Object.keys(updateFields).length > 0) {
            await trx(table).where(idColumn, post_id).update(updateFields);
        }

        await trx.commit();

        const updated = await knex(table).where(idColumn, post_id).first();
        return res.json({
            success: true,
            message: "글이 수정되었습니다.",
            post: await buildPostResponse(updated, writer_id)
        });
    } catch (err) {
        await trx.rollback();
        const status = err.httpcode || 500;
        const message = err.message && err.httpcode ? err.message : "서버 오류가 발생했습니다.";
        console.error(err);
        return res.status(status).json({ success: false, message });
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
        // JWT sub는 문자열이고 DB writer_id는 숫자이므로 형변환 후 비교
        if (!existing || Number(existing.writer_id) !== Number(writer_id)) {
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