import * as clc from "cli-color";
import { createHash } from "crypto";
import { createReadStream, statSync } from "fs";
import { size } from "lodash";
import * as path from "path";
import * as request from "request";
import * as zlib from "zlib";

import * as api from "../../api";
import * as detectProjectRoot from "../../detectProjectRoot";
import * as logger from "../../logger";
import { Queue } from "../../queue";
import * as hashcache from "./hashcache";

const MIN_UPLOAD_TIMEOUT: number = 30000; // 30s
const MAX_UPLOAD_TIMEOUT: number = 7200000; // 2h

function _progressMessage(message: string, current: number, total: number): string {
  current = Math.min(current, total);
  const progress = Math.floor((current * 1.0) / total) * 100;
  return `${message} [${current}/${total}] (${clc.bold.green(`${progress}%`)})`;
}

export interface UploaderOptions {
  version: string;
  files: string[];

  cwd?: string;
  public?: string;
  gzipLevel?: number;

  hashConcurrency?: number;
  populateBatchSize?: number;
  populateConcurrency?: number;
  uploadConcurrency?: number;
}

class Uploader {
  private readonly version: string;
  private readonly files: string[];
  private readonly fileCount: number;
  private readonly gzipLevel: number = 9;
  private readonly populateBatchSize: number = 1000;
  private readonly cwd: string = process.cwd();
  private readonly public: string = this.cwd;
  private readonly projectRoot: string;
  private readonly hashQueue: Queue<string>;
  private readonly populateQueue: Queue<{ [filename: string]: string }>;
  private readonly uploadQueue: Queue<string>;
  private readonly cache: hashcache.HashCache;
  private readonly cacheNew: hashcache.HashCache = {};
  private readonly sizeMap: { [key: string]: number } = {};
  private readonly hashMap: { [key: string]: string } = {};
  private readonly pathMap: { [key: string]: string } = {};

  private populateBatch: { [filename: string]: string } = {};
  private uploadUrl?: string;

  constructor(options: UploaderOptions) {
    this.version = options.version;
    this.files = options.files;
    this.fileCount = this.files.length;

    if (options.cwd) {
      this.cwd = options.cwd;
    }
    this.projectRoot = detectProjectRoot(this.cwd);

    if (typeof options.gzipLevel === "number") {
      this.gzipLevel = options.gzipLevel;
    }
    this.hashQueue = new Queue<string>({
      name: "hashQueue",
      concurrency: options.hashConcurrency || 50,
      handler: this.hashHandler.bind(this),
    });
    if (typeof options.populateBatchSize === "number") {
      this.populateBatchSize = options.populateBatchSize;
    }

    this.populateBatch = {};
    this.populateQueue = new Queue({
      name: "populateQueue",
      concurrency: options.populateConcurrency || 10,
      handler: this.populateHandler.bind(this),
      retries: 3,
    });

    this.uploadQueue = new Queue<string>({
      name: "uploadQueue",
      concurrency: options.uploadConcurrency || 200,
      handler: this.uploadHandler.bind(this),
      retries: 5,
    });
    if (options.public) {
      this.public = options.public;
    }

    this.cache = hashcache.load(this.projectRoot, this.hashcacheName());
  }

  public async start(): Promise<void> {
    // short-circuit when there's zero files
    if (this.files.length === 0) {
      return Promise.resolve();
    }

    this.files.forEach((f) => this.hashQueue.add(f));
    this.hashQueue.close();
    this.hashQueue.process();
    await this.hashQueue.wait();
    await this.queuePopulate();
    hashcache.dump(this.projectRoot, this.hashcacheName(), this.cacheNew);
    logger.debug("[hosting][hash queue][FINAL]", this.hashQueue.stats());

    this.populateQueue.close();
    await this.populateQueue.wait();
    logger.debug("[hosting][populate queue][FINAL]", this.populateQueue.stats());

    logger.debug("[hosting] uploads queued:", this.uploadQueue.tasks.length);
    this.uploadQueue.close();

    try {
      await this.wait();
    } finally {
      logger.debug("[hosting][upload queue][FINAL]", this.uploadQueue.stats());
    }
  }

  public wait(): Promise<void> {
    return Promise.all([
      this.hashQueue.wait(),
      this.populateQueue.wait(),
      this.uploadQueue.wait(),
    ]).then(() => undefined);
  }

  private statusMessage(): string {
    if (!this.hashQueue.finished) {
      return _progressMessage("hashing files", this.hashQueue.complete, this.fileCount);
    } else if (!this.populateQueue.finished) {
      return _progressMessage(
        "adding files to version",
        this.populateQueue.complete * 1000,
        this.fileCount
      );
    } else if (!this.uploadQueue.finished) {
      return _progressMessage(
        "uploading new files",
        this.uploadQueue.complete,
        this.uploadQueue.tasks.length
      );
    } else {
      return "upload complete";
    }
  }

  private hashHandler(filePath: string): Promise<void> {
    const stats = statSync(path.resolve(this.public, filePath));
    const mtime = stats.mtime.getTime();
    this.sizeMap[filePath] = stats.size;
    const cached = this.cache[filePath];
    if (cached && cached.mtime === mtime) {
      this.cacheNew[filePath] = cached;
      this.addHash(filePath, cached.hash);
      return Promise.resolve();
    }

    const fstream = this.zipStream(filePath);
    const hash = createHash("sha256");

    fstream.pipe(hash);

    return new Promise((resolve, reject) => {
      fstream.on("end", () => {
        const hashVal = (hash.read() as Buffer).toString("hex");
        this.cacheNew[filePath] = { mtime, hash: hashVal };
        this.addHash(filePath, hashVal);
        resolve();
      });

      fstream.on("error", reject);
    });
  }

  private addHash(filePath: string, hash: string): void {
    this.hashMap[hash] = filePath;
    this.pathMap[filePath] = hash;

    this.populateBatch["/" + filePath] = hash;

    const curBatchSize = size(this.populateBatch);
    if (curBatchSize > 0 && curBatchSize % this.populateBatchSize === 0) {
      this.queuePopulate();
    }
  }

  private queuePopulate(): void {
    const pop = this.populateBatch;
    this.populateQueue.add(pop);
    this.populateBatch = {};
    this.populateQueue.process();
  }

  private async populateHandler(batch: { [filename: string]: string }): Promise<void> {
    // wait for any existing populate calls to finish before proceeding
    const result = await api.request("POST", "/v1beta1/" + this.version + ":populateFiles", {
      origin: api.hostingApiOrigin,
      auth: true,
      data: { files: batch },
      logOptions: { skipRequestBody: true },
      timeout: 60000,
    });
    this.uploadUrl = result.body.uploadUrl;
    this.addUploads(result.body.uploadRequiredHashes || []);
  }

  private addUploads(hashes: string[]): void {
    hashes.forEach((hash) => this.uploadQueue.add(hash));
    this.uploadQueue.process();
  }

  private async uploadHandler(toUpload: string): Promise<any> {
    const reqOpts = await api.addRequestHeaders({
      url: this.uploadUrl + "/" + toUpload,
    });
    return new Promise((resolve, reject) => {
      this.zipStream(this.hashMap[toUpload]).pipe(
        request.post(
          Object.assign(reqOpts, {
            timeout: this.uploadTimeout(this.hashMap[toUpload]),
          }),
          (err: Error, res: request.Response) => {
            if (this.uploadQueue.cursor % 100 === 0) {
              logger.debug("[hosting][upload]", this.uploadQueue.stats());
            }
            if (err) {
              return reject(err);
            } else if (res.statusCode !== 200) {
              logger.debug(
                `[hosting][upload] ${this.hashMap[toUpload]} (${toUpload}) HTTP ERROR ${
                  res.statusCode
                }:`,
                res.headers,
                res.body
              );
              return reject(new Error("Unexpected error while uploading file."));
            }

            resolve();
          }
        )
      );
    });
  }

  private zipStream(filePath: string) {
    const gzip = zlib.createGzip({ level: this.gzipLevel });
    return createReadStream(path.resolve(this.public, filePath)).pipe(gzip);
  }

  private uploadTimeout(filePath: string) {
    const fsize = this.sizeMap[filePath] || 0;
    // 20s per MB bounded to min/max timeouts
    return Math.min(
      Math.max(Math.round(fsize / 1000) * 20, MIN_UPLOAD_TIMEOUT),
      MAX_UPLOAD_TIMEOUT
    );
  }

  private hashcacheName(): string {
    return Buffer.from(path.relative(this.projectRoot, this.public))
      .toString("base64")
      .replace(/=+$/, "");
  }
}

module.exports = Uploader;
