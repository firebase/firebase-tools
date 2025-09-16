"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadToTmp = void 0;
const url_1 = require("url");
const fs = __importStar(require("fs-extra"));
const ProgressBar = __importStar(require("progress"));
const tmp = __importStar(require("tmp"));
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
//# sourceMappingURL=downloadUtils.js.map