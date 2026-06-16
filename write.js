const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const { define_id, id_to_user_id, add_nickname, regist_file, regist_quote, regist_vote } = require('./general.js');
const { sendPostNotification } = require('./fcm.js');
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename, } = require("./utils/imageSaver");
const { buildPostResponse } = require("./postSerializer.js");

// mode("Jam-Talk"/"Jin-Talk") -> 테이블 매핑 헬퍼
function resolveModeTable(mode) {
    if (!["Jam-Talk", "Jin-Talk"].includes(mode)) return null;
    const table = mode === "Jam-Talk" ? "talk" : "think";
    return { table, idColumn: `${table}_num` };
}

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

// 내 임시저장 글 목록 조회 (이어쓰기용)
// GET /write/drafts?mode=Jam-Talk|Jin-Talk (mode 생략 시 전체)
router.get("/drafts", async (req, res) => {
    try {
        const writer_id = await define_id(req.headers.authorization, res);
        if (!writer_id) {
            return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
        }
        const page = parseInt(req.query.page) || 0;
        const { mode } = req.query;

        const tables = mode ? [mode] : ["Jam-Talk", "Jin-Talk"];
        const results = [];
        for (const m of tables) {
            const resolved = resolveModeTable(m);
            if (!resolved) {
                return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
            }
            // 본인 소유의 draft만 조회 (다른 사람의 임시저장은 절대 노출하지 않음)
            const rows = await knex(`${resolved.table} as p`)
                .leftJoin("profile", "p.writer_id", "profile.id")
                .where({ "p.writer_id": writer_id, "p.draft": 1 })
                .select("p.*", "profile.nickname", "profile.image as profile_image")
                .orderBy("p.timestamp", "desc")
                .limit(10)
                .offset(page * 10);
            results.push(...rows);
        }
        return res.json({ success: true, drafts: await buildPostResponse(results, writer_id) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 임시저장 글 단건 조회 (이어쓰기 화면 진입용, 작성자 본인만 조회 가능)
router.get("/draft/:mode/:id", async (req, res) => {
    try {
        const writer_id = await define_id(req.headers.authorization, res);
        if (!writer_id) {
            return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
        }
        const resolved = resolveModeTable(req.params.mode);
        if (!resolved) {
            return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
        }
        const post = await knex(resolved.table)
            .where(resolved.idColumn, req.params.id)
            .first();
        // 존재하지 않거나 소유자가 아니거나 이미 발행된 글이면 동일하게 404로 응답해
        // 다른 사람의 글(혹은 그 존재 여부)이 노출되지 않도록 한다.
        if (!post || post.writer_id !== writer_id || post.draft != 1) {
            return res.status(404).json({ success: false, message: "임시저장 글을 찾을 수 없습니다." });
        }
        return res.json({ success: true, draft: post });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

// 임시저장 글 수정 / 발행 (이어쓰기)
// body.draft 가 0이면 발행, 그 외(생략 포함)에는 임시저장 상태를 유지한다.
router.put("/:mode/:id", upload.array("files", 6), async (req, res) => {
    const resolved = resolveModeTable(req.params.mode);
    if (!resolved) {
        return res.status(400).json({ success: false, message: "유효하지 않은 mode입니다." });
    }
    const writer_id = await define_id(req.headers.authorization, res);
    if (!writer_id) {
        return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    const trx = await knex.transaction();
    try {
        const existing = await trx(resolved.table).where(resolved.idColumn, req.params.id).first();
        if (!existing) {
            await trx.rollback();
            return res.status(404).json({ success: false, message: "글을 찾을 수 없습니다." });
        }
        if (existing.writer_id !== writer_id) {
            await trx.rollback();
            return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
        }
        // 이미 발행된 글은 이 엔드포인트로 수정할 수 없다 (임시저장 이어쓰기 전용).
        if (existing.draft != 1) {
            await trx.rollback();
            return res.status(409).json({ success: false, message: "이미 발행된 글은 이어쓰기로 수정할 수 없습니다." });
        }

        const { subject, header } = req.body;
        if (!subject) {
            await trx.rollback();
            return res.status(400).json({ success: false, message: "subject는 필수입니다." });
        }
        const newDraft = (req.body.draft === undefined) ? 1 : parseInt(req.body.draft) || 0;

        const updateFields = { subject, header: header ?? existing.header };

        // 파일이 새로 첨부된 경우에만 기존 사진을 교체한다.
        if (req.files && req.files.length > 0) {
            const filenames = await Promise.all(req.files.map(f => regist_file(f)));
            updateFields.photo = filenames[0] ?? null;
            for (let i = 1; i <= 5; i++) {
                updateFields[`photo_${i}`] = filenames[i] ?? null;
            }
        }

        // 인용은 발행 시점에만 등록한다 (draft 상태에서는 카운터를 증가시키지 않음).
        if (req.body.quote && newDraft === 0 && !existing.quote) {
            try {
                const { quote, quote_type } = await regist_quote(trx, req);
                updateFields.quote = quote;
                updateFields.quote_type = quote_type;
            } catch (err) {
                await trx.rollback();
                console.error("인용 과정에서 문제가 발생했습니다");
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." });
            }
        }

        // 투표가 아직 등록되지 않은 경우에만 새로 등록한다 (중복 등록 방지).
        if (req.body.vote && !existing.vote) {
            try {
                const post_type = resolved.table === "talk" ? 0 : 1;
                await regist_vote(trx, { vote: req.body.vote, post_type, post_num: req.params.id, table: resolved.table });
            } catch (err) {
                await trx.rollback();
                const status = err.httpcode || 500;
                const message = err.message || "투표 등록 중 오류가 발생했습니다.";
                console.error(err);
                return res.status(status).json({ success: false, message });
            }
        }

        updateFields.draft = newDraft;
        await trx(resolved.table).where(resolved.idColumn, req.params.id).update(updateFields);
        await trx.commit();

        res.json({ success: true, message: newDraft === 0 ? "글이 발행되었습니다." : "임시저장이 갱신되었습니다." });

        if (newDraft === 0) {
            const nickname = await add_nickname(writer_id);
            sendPostNotification(writer_id, nickname, req.params.mode);
        }
    } catch (err) {
        await trx.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});

module.exports = router;