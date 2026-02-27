const express = require("express");
const router = express.Router();
const knex = require("./knex.js");
const convert_our_id = require('./general.js').define_id;
const id_to_user_id = require('./general.js').id_to_user_id;
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
    const { mode, header, subject } = req.body;

    if ( !mode || !header || !subject) {
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
        let quote = req.body.quote_num
        console.log(quote)
        if (req.body.quote_num) {
            try {
                const {quote_num, ...rest} = await knex(table).select("quote_num").where(`${table}_num`, quote).first();
                console.log(quote_num);
                await knex(table).update({ "quote_num": quote_num + 1 }).where(`${table}_num`, quote);
            } catch(err) {
                console.error(err);
                return res.status(500).json({ msg: "인용 과정에서 문제가 발생했습니다." })
            }
        }
        const user_id=await id_to_user_id(writer_id);
        await knex(table).insert({
            writer_id: writer_id,
            user_id: user_id,
            header: header,
            subject: subject,
            reported: 0, // 기본값: 신고되지 않음
            photo: filename,
            quote
        });

        res.status(201).json({ success: true, message: "글이 성공적으로 등록되었습니다." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }
});



module.exports = router;