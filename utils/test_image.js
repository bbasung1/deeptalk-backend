// test_image.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const { saveImage, generateFilename } = require("./utils/imageSaver");

router.post("/image-save", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "파일이 필요합니다." });
        }

        const ext = req.file.originalname.split(".").pop();
        const filename = generateFilename(ext);

        const savedPath = await saveImage(req.file.buffer, filename);

        return res.json({
            success: true,
            filename,
            savedPath
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "이미지 저장 실패" });
    }
});

module.exports = router;
