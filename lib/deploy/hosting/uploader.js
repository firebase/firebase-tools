"use strict";

const clc = require("cli-color");
const fs = require("fs");
const path = require("path");
const request = require("request");
const size = require("lodash/size");
const zlib = require("zlib");
const crypto = require("crypto");

const hashcache = require("./hashcache");
const detectProjectRoot = require("../../detectProjectRoot");
const api = require("../../api");
const logger = require("../../logger");
const Queue = require("../../queue");

function _progressMessage(message, current, total) {
  current = Math.min(current, total);
  return (
    message +
    " [" +
    current +
    "/" +
    total +
    "] (" +
    clc.bold.green(Math.floor(current * 1.0 / total * 100).toString() + "%") +
    ")"
  );
}

class Uploader {
  constructor(options) {
    this.version = options.version;
    this.cwd = options.cwd || process.cwd();

    this.projectRoot = detectProjectRoot(this.cwd);

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

    this.cache = hashcache.load(this.projectRoot, this.hashcacheName());
    this.cacheNew = {};

    this.hashMap = {};
    this.pathMap = {};
  }

  hashcacheName() {
    return Buffer.from(path.relative(this.projectRoot, this.public))
      .toString("base64")
      .replace(/=+$/, "");
  }

  start() {
    const self = this;
    // short-circuit when there's zero files
    if (this.files.length === 0) {
      return Promise.resolve();
    }

    this.files.forEach(function(f) {
      self.hashQueue.add(f);
    });
    self.hashQueue.close();
    self.hashQueue.process();
    self.hashQueue
      .wait()
      .then(self.queuePopulate.bind(self))
      .then(function() {
        hashcache.dump(self.projectRoot, self.hashcacheName(), self.cacheNew);
        logger.debug("[hosting][hash queue][FINAL]", self.hashQueue.stats());
        self.populateQueue.close();
        return self.populateQueue.wait();
      })
      .then(function() {
        logger.debug("[hosting][populate queue][FINAL]", self.populateQueue.stats());
        logger.debug("[hosting] uploads queued:", self.uploadQueue.tasks.length);
        self.uploadQueue.close();
      });

    const fin = function(err) {
      logger.debug("[hosting][upload queue][FINAL]", self.uploadQueue.stats());
      if (err) throw err;
    };

    return this.wait()
      .then(fin)
      .catch(fin);
  }

  wait() {
    return Promise.all([
      this.hashQueue.wait(),
      this.populateQueue.wait(),
      this.uploadQueue.wait(),
    ]).then(function() {
      return; // don't return an array of three `undefined`
    });
  }

  statusMessage() {
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

  hashHandler(filePath) {
    const stats = fs.statSync(path.resolve(this.public, filePath));
    const mtime = stats.mtime.getTime();
    const cached = this.cache[filePath];
    if (cached && cached.mtime === mtime) {
      this.cacheNew[filePath] = cached;
      this.addHash(filePath, cached.hash);
      return Promise.resolve();
    }

    const fstream = this._zipStream(filePath);
    const hash = crypto.createHash("sha256");

    fstream.pipe(hash);

    const self = this;
    return new Promise(function(resolve, reject) {
      fstream.on("end", function() {
        const hashVal = hash.read().toString("hex");
        self.cacheNew[filePath] = { mtime: mtime, hash: hashVal };
        self.addHash(filePath, hashVal);
        resolve();
      });

      fstream.on("error", reject);
    });
  }

  addHash(filePath, hash) {
    this.hashMap[hash] = filePath;
    this.pathMap[filePath] = hash;

    this.populateBatch["/" + filePath] = hash;
    this.populateCount++;

    const curBatchSize = size(this.populateBatch);
    if (curBatchSize > 0 && curBatchSize % this.populateBatchSize === 0) {
      this.queuePopulate();
    }
  }

  queuePopulate() {
    const pop = this.populateBatch;
    this.populateQueue.add(pop, "batch" + (this.populateQueue.tasks.length + 1));
    this.populateBatch = {};
    this.populateQueue.process();
  }

  populateHandler(batch) {
    const self = this;
    // wait for any existing populate calls to finish before proceeding
    return api
      .request("POST", "/v1beta1/" + self.version + ":populateFiles", {
        origin: api.hostingApiOrigin,
        auth: true,
        data: { files: batch },
        logOptions: { skipRequestBody: true },
      })
      .then(function(result) {
        self.uploadUrl = result.body.uploadUrl;
        self.addUploads(result.body.uploadRequiredHashes || []);
      });
  }

  addUploads(hashes) {
    const self = this;
    hashes.forEach(function(hash) {
      self.uploadQueue.add(hash);
    });
    self.uploadQueue.process();
  }

  uploadHandler(toUpload) {
    const self = this;

    return api
      .addRequestHeaders({
        url: this.uploadUrl + "/" + toUpload,
      })
      .then(function(reqOpts) {
        return new Promise(function(resolve, reject) {
          self._zipStream(self.hashMap[toUpload]).pipe(
            request.post(reqOpts, function(err, res) {
              if (self.uploadQueue.cursor % 100 === 0) {
                logger.debug("[hosting][upload]", self.uploadQueue.stats());
              }
              if (err) {
                return reject(err);
              } else if (res.statusCode !== 200) {
                logger.debug(
                  "[hosting][upload]",
                  self.hashMap[toUpload],
                  "(" + toUpload + ")",
                  "HTTP ERROR",
                  res.statusCode,
                  ":",
                  res.headers,
                  res.body
                );
                return reject(new Error("Unexpected error while uploading file."));
              }

              resolve();
            })
          );
        });
      });
  }

  _zipStream(filePath) {
    const gzip = zlib.createGzip({ level: this.gzipLevel });
    return fs.createReadStream(path.resolve(this.public, filePath)).pipe(gzip);
  }
}

module.exports = Uploader;
