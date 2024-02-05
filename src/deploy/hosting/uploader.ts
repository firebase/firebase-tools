import { size } from "lodash";
import AbortController from "abort-controller";
import * as clc from "colorette";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

import { Client } from "../../apiv2";
import { Queue } from "../../throttler/queue";
import { hostingApiOrigin } from "../../api";
import { load, dump, HashRecord } from "./hashcache";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";

const MIN_UPLOAD_TIMEOUT = 30000; // 30s
const MAX_UPLOAD_TIMEOUT = 7200000; // 2h

function progressMessage(message: string, current: number, total: number): string {
  current = Math.min(current, total);
  const percent = Math.floor(((current * 1.0) / total) * 100).toString();
  return `${message} [${current}/${total}] (${clc.bold(clc.green(`${percent}%`))})`;
}

export class Uploader {
  private version: string;
  private cwd: string;
  private projectRoot: string;
  private gzipLevel: number;
  private hashQueue: Queue<string, void>;
  private populateBatchSize: number;
  private populateBatch: Record<string, string>;
  private populateQueue: Queue<Record<string, string>, void>;
  private uploadQueue: Queue<string, void>;
  private public: string;
  private files: string[];
  private fileCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache: Map<string, HashRecord>;
  private cacheNew: Map<string, HashRecord>;
  private sizeMap: { [key: string]: number };
  private hashMap: { [key: string]: string };
  private pathMap: { [key: string]: string };
  private uploadUrl: string | undefined;
  private uploadClient: Client | undefined;
  private hashClient = new Client({
    urlPrefix: hostingApiOrigin,
    auth: true,
    apiVersion: "v1beta1",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(options: any) {
    this.version = options.version;
    this.cwd = options.cwd || process.cwd();
    this.projectRoot = options.projectRoot;

    this.gzipLevel = options.gzipLevel || 9;
    this.hashQueue = new Queue({
      name: "hashQueue",
      concurrency: options.hashConcurrency || 50,
      handler: this.hashHandler.bind(this),
    });
    this.populateBatchSize = options.populateBatchSize || 1000;
    this.populateBatch = {};
    this.populateQueue = new Queue({
      name: "populateQueue",
      concurrency: options.populateConcurrency || 10,
      handler: this.populateHandler.bind(this),
      retries: 3,
    });
    this.uploadQueue = new Queue({
      name: "uploadQueue",
      concurrency: options.uploadConcurrency || 200,
      handler: this.uploadHandler.bind(this),
      retries: 5,
    });
    this.public = options.public || this.cwd;
    this.files = options.files;
    this.fileCount = this.files.length;

    this.cache = load(this.projectRoot, this.hashcacheName());
    this.cacheNew = new Map();

    this.sizeMap = {};
    this.hashMap = {};
    this.pathMap = {};
  }

  hashcacheName(): string {
    return Buffer.from(path.relative(this.projectRoot, this.public))
      .toString("base64")
      .replace(/=+$/, "");
  }

  public async start(): Promise<void> {
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
        dump(this.projectRoot, this.hashcacheName(), this.cacheNew);
        logger.debug("[hosting][hash queue][FINAL]", this.hashQueue.stats());
        this.populateQueue.close();
        return this.populateQueue.wait();
      })
      .then(() => {
        logger.debug("[hosting][populate queue][FINAL]", this.populateQueue.stats());
        logger.debug("[hosting] uploads queued:", this.uploadQueue.stats().total);
        this.uploadQueue.close();
      });

    this.uploadQueue.wait().catch((err: Error) => {
      if (err.message.includes("content hash")) {
        logger.debug(
          "[hosting][upload queue] upload failed with content hash error. Deleting hash cache",
        );
        dump(this.projectRoot, this.hashcacheName(), new Map());
      }
    });

    const fin = (err: unknown): void => {
      logger.debug("[hosting][upload queue][FINAL]", this.uploadQueue.stats());
      if (err) {
        throw err;
      }
    };

    return this.wait().then(fin).catch(fin);
  }

  async wait(): Promise<void> {
    await Promise.all([this.hashQueue.wait(), this.populateQueue.wait(), this.uploadQueue.wait()]);
  }

  statusMessage(): string {
    if (!this.hashQueue.finished) {
      return progressMessage("hashing files", this.hashQueue.complete, this.fileCount);
    } else if (!this.populateQueue.finished) {
      return progressMessage(
        "adding files to version",
        this.populateQueue.complete * 1000,
        this.fileCount,
      );
    } else if (!this.uploadQueue.finished) {
      return progressMessage(
        "uploading new files",
        this.uploadQueue.complete,
        this.uploadQueue.stats().total,
      );
    } else {
      return "upload complete";
    }
  }

  async hashHandler(filePath: string): Promise<void> {
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

  addHash(filePath: string, hash: string): void {
    this.hashMap[hash] = filePath;
    this.pathMap[filePath] = hash;

    this.populateBatch["/" + filePath] = hash;

    const curBatchSize = size(this.populateBatch);
    if (curBatchSize > 0 && curBatchSize % this.populateBatchSize === 0) {
      this.queuePopulate();
    }
  }

  queuePopulate(): void {
    const pop = this.populateBatch;
    this.populateQueue.add(pop);
    this.populateBatch = {};
    this.populateQueue.process();
  }

  async populateHandler(batch: Record<string, string>): Promise<void> {
    // wait for any existing populate calls to finish before proceeding
    const res = await this.hashClient.post<
      unknown,
      { uploadUrl: string; uploadRequiredHashes: string[] }
    >(`/${this.version}:populateFiles`, { files: batch });
    this.uploadUrl = res.body.uploadUrl;
    this.uploadClient = new Client({ urlPrefix: this.uploadUrl, auth: true });
    this.addUploads(res.body.uploadRequiredHashes || []);
  }

  addUploads(hashes: string[]): void {
    for (const hash of hashes) {
      this.uploadQueue.add(hash);
    }
    this.uploadQueue.process();
  }

  async uploadHandler(toUpload: string): Promise<void> {
    if (!this.uploadClient) {
      throw new FirebaseError("No upload client available.", { exit: 2 });
    }
    const controller = new AbortController();
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
      logger.debug("[hosting][upload]", this.uploadQueue.stats());
    }
    if (res.status !== 200) {
      const errorMessage = await res.response.text();
      logger.debug(
        `[hosting][upload] ${this.hashMap[toUpload]} (${toUpload}) HTTP ERROR ${
          res.status
        }: headers=${JSON.stringify(res.response.headers)} ${errorMessage}`,
      );
      throw new Error(`Unexpected error while uploading file: ${errorMessage}`);
    }
  }

  zipStream(filePath: string): zlib.Gzip {
    const file = fs.createReadStream(path.resolve(this.public, filePath));
    const gzip = zlib.createGzip({ level: this.gzipLevel });
    return file.pipe(gzip);
  }

  uploadTimeout(filePath: string): number {
    const size = this.sizeMap[filePath] || 0;
    // 20s per MB bounded to min/max timeouts
    return Math.min(Math.max(Math.round(size / 1000) * 20, MIN_UPLOAD_TIMEOUT), MAX_UPLOAD_TIMEOUT);
  }
}
