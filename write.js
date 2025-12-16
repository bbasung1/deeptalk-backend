const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const convert_our_id = require('./general.js').define_id;
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename } = require("./utils/imageSaver");

router.use(express.json());

router.post("/", upload.single("file"), async (req, res) => {
    const { user_id, mode, header, subject } = req.body;

    if (!user_id || !mode || !header || !subject) {
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

        await knex(table).insert({
            writer_id: writer_id,
            header: header,
            subject: subject,
            reported: 0, // 기본값: 신고되지 않음
            photo: filename
        });

        res.status(201).json({ success: true, message: "글이 성공적으로 등록되었습니다." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});



module.exports = router;