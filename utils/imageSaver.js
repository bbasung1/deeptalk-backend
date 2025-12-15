// utils/imageSaver.js
const fs = require("fs");
const path = require("path");

// 저장 폴더 기본값
// const DEFAULT_DIR = path.join(__dirname, "..", "uploads");
const DEFAULT_DIR = process.env.FILE_DIR;

/**
 * Buffer 또는 base64 이미지 데이터를 로컬에 저장하는 유틸 함수
 * @param {Buffer | string} data - 이미지 binary or base64
 * @param {string} filename - 저장할 파일 이름 (확장자 포함)
 * @param {string} folder - 저장될 폴더 경로(optional)
 * @returns {string} 저장된 파일의 절대 경로
 */
async function saveImage(data, filename, folder = DEFAULT_DIR) {
    try {
        // 폴더 없으면 자동 생성
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }

        const filePath = path.join(folder, filename);

        // base64 문자열이면 변환
        if (typeof data === "string" && data.startsWith("data:image")) {
            const base64Data = data.split(";base64,").pop();
            fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
        } else {
            fs.writeFileSync(filePath, data);
        }

        return filePath;
    } catch (err) {
        console.error("❌ saveImage error:", err);
        throw new Error("Failed to save image");
    }
}

/**
 * 자동 파일명 생성 (ex: img_20251210_235959_123.png)
 */
function generateFilename(ext = "png") {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");

    return `img_${yyyy}${mm}${dd}_${hh}${mi}${ss}_${ms}.${ext}`;
}

module.exports = {
    saveImage,
    generateFilename
};
