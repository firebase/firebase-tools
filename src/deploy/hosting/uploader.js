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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Uploader = void 0;
const lodash_1 = require("lodash");
const abort_controller_1 = __importDefault(require("abort-controller"));
const clc = __importStar(require("colorette"));
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib = __importStar(require("zlib"));
const apiv2_1 = require("../../apiv2");
const queue_1 = require("../../throttler/queue");
const api_1 = require("../../api");
const hashcache_1 = require("./hashcache");
const logger_1 = require("../../logger");
const error_1 = require("../../error");
const MIN_UPLOAD_TIMEOUT = 30000; // 30s
const MAX_UPLOAD_TIMEOUT = 7200000; // 2h
function progressMessage(message, current, total) {
    current = Math.min(current, total);
    const percent = Math.floor(((current * 1.0) / total) * 100).toString();
    return `${message} [${current}/${total}] (${clc.bold(clc.green(`${percent}%`))})`;
}
class Uploader {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(options) {
        this.hashClient = new apiv2_1.Client({
            urlPrefix: (0, api_1.hostingApiOrigin)(),
            auth: true,
            apiVersion: "v1beta1",
        });
        this.version = options.version;
        this.cwd = options.cwd || process.cwd();
        this.projectRoot = options.projectRoot;
        this.gzipLevel = options.gzipLevel || 9;
        this.hashQueue = new queue_1.Queue({
            name: "hashQueue",
            concurrency: options.hashConcurrency || 50,
            handler: this.hashHandler.bind(this),
        });
        this.populateBatchSize = options.populateBatchSize || 1000;
        this.populateBatch = {};
        this.populateQueue = new queue_1.Queue({
            name: "populateQueue",
            concurrency: options.populateConcurrency || 10,
            handler: this.populateHandler.bind(this),
            retries: 3,
        });
        this.uploadQueue = new queue_1.Queue({
            name: "uploadQueue",
            concurrency: options.uploadConcurrency || 200,
            handler: this.uploadHandler.bind(this),
            retries: 5,
        });
        this.public = options.public || this.cwd;
        this.files = options.files;
        this.fileCount = this.files.length;
        this.cache = (0, hashcache_1.load)(this.projectRoot, this.hashcacheName());
        this.cacheNew = new Map();
        this.sizeMap = {};
        this.hashMap = {};
        this.pathMap = {};
    }
    hashcacheName() {
        return Buffer.from(path.relative(this.projectRoot, this.public))
            .toString("base64")
            .replace(/=+$/, "");
    }
    async start() {
        // short-circuit when there's zero files
        if (this.files.length === 0) {
            return;
        }
        for (const f of this.files) {
            this.hashQueue.add(f);
        }
        this.hashQueue.close();
        this.hashQueue.process();
        this.hashQueue
            .wait()
            .then(this.queuePopulate.bind(this))
            .then(() => {
            (0, hashcache_1.dump)(this.projectRoot, this.hashcacheName(), this.cacheNew);
            logger_1.logger.debug("[hosting][hash queue][FINAL]", this.hashQueue.stats());
            this.populateQueue.close();
            return this.populateQueue.wait();
        })
            .then(() => {
            logger_1.logger.debug("[hosting][populate queue][FINAL]", this.populateQueue.stats());
            logger_1.logger.debug("[hosting] uploads queued:", this.uploadQueue.stats().total);
            this.uploadQueue.close();
        });
        this.uploadQueue.wait().catch((err) => {
            if (err.message.includes("content hash")) {
                logger_1.logger.debug("[hosting][upload queue] upload failed with content hash error. Deleting hash cache");
                (0, hashcache_1.dump)(this.projectRoot, this.hashcacheName(), new Map());
            }
        });
        const fin = (err) => {
            logger_1.logger.debug("[hosting][upload queue][FINAL]", this.uploadQueue.stats());
            if (err) {
                throw err;
            }
        };
        return this.wait().then(fin).catch(fin);
    }
    async wait() {
        await Promise.all([this.hashQueue.wait(), this.populateQueue.wait(), this.uploadQueue.wait()]);
    }
    statusMessage() {
        if (!this.hashQueue.finished) {
            return progressMessage("hashing files", this.hashQueue.complete, this.fileCount);
        }
        else if (!this.populateQueue.finished) {
            return progressMessage("adding files to version", this.populateQueue.complete * 1000, this.fileCount);
        }
        else if (!this.uploadQueue.finished) {
            return progressMessage("uploading new files", this.uploadQueue.complete, this.uploadQueue.stats().total);
        }
        else {
            return "upload complete";
        }
    }
    async hashHandler(filePath) {
        const stats = fs.statSync(path.resolve(this.public, filePath));
        const mtime = stats.mtime.getTime();
        this.sizeMap[filePath] = stats.size;
        const cached = this.cache.get(filePath);
        if (cached && cached.mtime === mtime) {
            this.cacheNew.set(filePath, cached);
            this.addHash(filePath, cached.hash);
            return;
        }
        const fstream = this.zipStream(filePath);
        const hash = crypto.createHash("sha256");
        fstream.pipe(hash);
        return new Promise((resolve, reject) => {
            fstream.on("end", resolve);
            fstream.on("error", reject);
        }).then(() => {
            const hashVal = hash.read().toString("hex");
            this.cacheNew.set(filePath, { mtime: mtime, hash: hashVal });
            this.addHash(filePath, hashVal);
        });
    }
    addHash(filePath, hash) {
        this.hashMap[hash] = filePath;
        this.pathMap[filePath] = hash;
        this.populateBatch["/" + filePath] = hash;
        const curBatchSize = (0, lodash_1.size)(this.populateBatch);
        if (curBatchSize > 0 && curBatchSize % this.populateBatchSize === 0) {
            this.queuePopulate();
        }
    }
    queuePopulate() {
        const pop = this.populateBatch;
        this.populateQueue.add(pop);
        this.populateBatch = {};
        this.populateQueue.process();
    }
    async populateHandler(batch) {
        // wait for any existing populate calls to finish before proceeding
        const res = await this.hashClient.post(`/${this.version}:populateFiles`, { files: batch });
        this.uploadUrl = res.body.uploadUrl;
        this.uploadClient = new apiv2_1.Client({ urlPrefix: this.uploadUrl, auth: true });
        this.addUploads(res.body.uploadRequiredHashes || []);
    }
    addUploads(hashes) {
        for (const hash of hashes) {
            this.uploadQueue.add(hash);
        }
        this.uploadQueue.process();
    }
    async uploadHandler(toUpload) {
        if (!this.uploadClient) {
            throw new error_1.FirebaseError("No upload client available.", { exit: 2 });
        }
        const controller = new abort_controller_1.default();
        const timeout = setTimeout(() => {
            controller.abort();
        }, this.uploadTimeout(this.hashMap[toUpload]));
        const res = await this.uploadClient.request({
            method: "POST",
            path: `/${toUpload}`,
            body: this.zipStream(this.hashMap[toUpload]),
            resolveOnHTTPError: true,
            responseType: "stream",
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (this.uploadQueue.cursor % 100 === 0) {
            logger_1.logger.debug("[hosting][upload]", this.uploadQueue.stats());
        }
        if (res.status !== 200) {
            const errorMessage = await res.response.text();
            logger_1.logger.debug(`[hosting][upload] ${this.hashMap[toUpload]} (${toUpload}) HTTP ERROR ${res.status}: headers=${JSON.stringify(res.response.headers)} ${errorMessage}`);
            throw new Error(`Unexpected error while uploading file: ${errorMessage}`);
        }
    }
    zipStream(filePath) {
        const file = fs.createReadStream(path.resolve(this.public, filePath));
        const gzip = zlib.createGzip({ level: this.gzipLevel });
        return file.pipe(gzip);
    }
    uploadTimeout(filePath) {
        const size = this.sizeMap[filePath] || 0;
        // 20s per MB bounded to min/max timeouts
        return Math.min(Math.max(Math.round(size / 1000) * 20, MIN_UPLOAD_TIMEOUT), MAX_UPLOAD_TIMEOUT);
    }
}
exports.Uploader = Uploader;
//# sourceMappingURL=uploader.js.map