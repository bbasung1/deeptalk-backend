// utils/imageResize.js
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const FILE_DIR = path.resolve(process.env.FILE_DIR);
const CACHE_DIR = path.join(FILE_DIR, "cache");
const ALLOWED_WIDTHS = [200, 400, 800];
const RESIZABLE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * relPath에 해당하는 원본 이미지를 width로 리사이즈한 캐시 파일의 절대 경로를 반환한다.
 * 캐시가 없으면 생성한다. gif 등 비대상 확장자는 원본 경로를 그대로 반환한다.
 */
async function getResizedFilePath(relPath, width) {
    const resolvedFile = path.resolve(FILE_DIR, relPath);
    if (!resolvedFile.startsWith(FILE_DIR + path.sep)) {
        const err = new Error("Invalid path");
        err.code = "EINVALPATH";
        throw err;
    }
    if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
        const err = new Error("File not found");
        err.code = "ENOENT";
        throw err;
    }

    const ext = path.extname(resolvedFile).toLowerCase();
    if (!RESIZABLE_EXTS.includes(ext)) {
        return resolvedFile;
    }

    const cachedFile = path.join(CACHE_DIR, String(width), relPath);
    if (fs.existsSync(cachedFile)) {
        return cachedFile;
    }

    fs.mkdirSync(path.dirname(cachedFile), { recursive: true });
    await sharp(resolvedFile)
        .resize({ width, withoutEnlargement: true })
        .toFile(cachedFile);

    return cachedFile;
}

module.exports = { getResizedFilePath, ALLOWED_WIDTHS };
