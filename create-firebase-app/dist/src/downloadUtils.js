"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadToTmp = void 0;
const url_1 = require("url");
const fs = require("fs-extra");
const ProgressBar = require("progress");
const tmp = require("tmp");
const apiv2_1 = require("./apiv2");
const error_1 = require("./error");
/**
 * Downloads the resource at `remoteUrl` to a temporary file.
 * Resolves to the temporary file's name, rejects if there's any error.
 * @param remoteUrl URL to download.
 * @param auth Whether to include an access token in the download request. Defaults to false.
 */
async function downloadToTmp(remoteUrl, auth = false) {
    const u = new url_1.URL(remoteUrl);
    const c = new apiv2_1.Client({ urlPrefix: u.origin, auth });
    const tmpfile = tmp.fileSync();
    const writeStream = fs.createWriteStream(tmpfile.name);
    const res = await c.request({
        ignoreQuotaProject: true,
        method: "GET",
        path: u.pathname,
        queryParams: u.searchParams,
        responseType: "stream",
        resolveOnHTTPError: true,
    });
    if (res.status !== 200) {
        throw new error_1.FirebaseError(`download failed, status ${res.status}: ${await res.response.text()}`);
    }
    const total = parseInt(res.response.headers.get("content-length") || "0", 10);
    const totalMb = Math.ceil(total / 1000000);
    const bar = new ProgressBar(`Progress: :bar (:percent of ${totalMb}MB)`, { total, head: ">" });
    res.body.on("data", (chunk) => {
        bar.tick(chunk.length);
    });
    await new Promise((resolve) => {
        writeStream.on("finish", resolve);
        res.body.pipe(writeStream);
    });
    return tmpfile.name;
}
exports.downloadToTmp = downloadToTmp;
