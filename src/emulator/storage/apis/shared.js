"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFileBytes = void 0;
const zlib_1 = require("zlib");
const crc_1 = require("../crc");
const rfc_1 = require("../rfc");
/** Populates an object media GET Express response. */
function sendFileBytes(md, data, req, res) {
    let didGunzip = false;
    if (md.contentEncoding === "gzip") {
        const acceptEncoding = req.header("accept-encoding") || "";
        const shouldGunzip = !acceptEncoding.includes("gzip");
        if (shouldGunzip) {
            data = (0, zlib_1.gunzipSync)(data);
            didGunzip = true;
        }
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", md.contentType || "application/octet-stream");
    // remove the folder name from the downloaded file name
    const fileName = md.name.split("/").pop();
    res.setHeader("Content-Disposition", `${md.contentDisposition || "attachment"}; filename*=${(0, rfc_1.encodeRFC5987)(fileName)}`);
    if (didGunzip) {
        // Set to mirror server behavior and supress express's "content-length" header.
        res.setHeader("Transfer-Encoding", "chunked");
    }
    else {
        // Don't populate Content-Encoding if decompressed, see
        // https://cloud.google.com/storage/docs/transcoding#decompressive_transcoding.
        res.setHeader("Content-Encoding", md.contentEncoding || "");
    }
    res.setHeader("ETag", md.etag);
    res.setHeader("Cache-Control", md.cacheControl || "");
    res.setHeader("x-goog-generation", `${md.generation}`);
    res.setHeader("x-goog-metadatageneration", `${md.metageneration}`);
    res.setHeader("x-goog-storage-class", md.storageClass);
    res.setHeader("x-goog-hash", `crc32c=${(0, crc_1.crc32cToString)(md.crc32c)},md5=${md.md5Hash}`);
    // Content Range headers should be respected only if data was not decompressed, see
    // https://cloud.google.com/storage/docs/transcoding#range.
    const shouldRespectContentRange = !didGunzip;
    if (shouldRespectContentRange) {
        const byteRange = req.range(data.byteLength, { combine: true });
        if (Array.isArray(byteRange) && byteRange.type === "bytes" && byteRange.length > 0) {
            const range = byteRange[0];
            res.setHeader("Content-Range", `${byteRange.type} ${range.start}-${range.end}/${data.byteLength}`);
            // Byte range requests are inclusive for start and end
            res.status(206).end(data.slice(range.start, range.end + 1));
            return;
        }
    }
    res.end(data);
}
exports.sendFileBytes = sendFileBytes;
//# sourceMappingURL=shared.js.map