// test_image.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename } = require("../utils/imageSaver");
const knex = require("../knex.js");
const define_id = require("../general.js").define_id;
const FILE_DIR = process.env.PROFILE_FILE_DIR;
const fs = require("fs").promises;

router.post("/", upload.single("file"), async (req, res) => {
    try {
        const ourid = await define_id(req.headers.authorization, res);
        if (!ourid) return res.status(401).json({ success: false, message: "인증 실패" }); // 인증 실패 시 종료
        if (!req.file) {
            return res.status(400).json({ success: false, message: "파일이 필요합니다." });
        }
        const oldImage = await knex("profile").select("image").where({ id: ourid }).first();
        console.log(oldImage);
        if (oldImage.image != null) {
            const oldImagePath = `${FILE_DIR}/${oldImage.image}`;
            try {
                console.log(oldImagePath)
                await fs.unlink(oldImagePath);
            } catch (err) {
                return res.status(500).json({ success: false, message: "이전 이미지 삭제 실패" });
            }
        }
        const ext = req.file.originalname.split(".").pop();
        const filename = `img_${ourid}.${ext}`;

        const savedPath = await saveImage(req.file.buffer, filename, FILE_DIR);
        await knex("profile").update({ image: filename }).where({ id: ourid });
        return res.json({
            success: true,
            filename
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "이미지 저장 실패" });
    }
});

module.exports = router;