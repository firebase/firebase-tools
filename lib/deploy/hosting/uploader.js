"use strict";

const fs = require("fs");
const path = require("path");
const request = require("request");
const size = require("lodash/size");
const zlib = require("zlib");
const crypto = require("crypto");

const hashcache = require("./hashcache");
const api = require("../../api");
const logger = require("../../logger");
const Queue = require("../../queue");

class Uploader {
  constructor(options) {
    this.version = options.version;
    this.cwd = options.cwd || process.cwd();

    this.cache = hashcache.load(this.cwd);
    this.cacheNew = {};

    this.gzipLevel = options.gzipLevel || 9;
    this.hashQueue = new Queue({
      concurrency: options.hashConcurrency || 50,
      handler: this.hashHandler.bind(this),
    });
    this.populateBatchSize = options.populateBatchSize || 1000;
    this.populateBatch = {};
    this.populateQueue = new Queue({
      concurrency: options.populateConcurrency || 10,
      handler: this.populateHandler.bind(this),
    });
    this.uploadQueue = new Queue({
      concurrency: options.uploadConcurrency || 200,
      handler: this.uploadHandler.bind(this),
    });
    this.public = options.public || this.cwd;
    this.files = options.files;
    this.fileCount = this.files.length;
    this.hashMap = {};
    this.pathMap = {};
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
        hashcache.dump(self.cwd, self.cacheNew);
        logger.debug("[hosting][hash queue]", self.hashQueue.stats());
        self.populateQueue.close();
        return self.populateQueue.wait();
      })
      .then(function() {
        logger.debug("[hosting][populate queue]", self.populateQueue.stats());
        logger.debug("[hosting] uploads queued:", self.uploadQueue.tasks.length);
        self.uploadQueue.close();
      });

    const fin = function(err) {
      logger.debug("[hosting][upload queue]", self.uploadQueue.stats());
      if (err) throw err;
    };
    return this.wait()
      .then(fin)
      .catch(fin);
  }

  wait() {
    return this.uploadQueue.wait();
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
    const npath = path.relative(this.public, path.resolve(this.public, filePath));
    this.hashMap[hash] = npath;
    this.pathMap[npath] = hash;

    this.populateBatch["/" + npath] = hash;
    this.populateCount++;

    const curBatchSize = size(this.populateBatch);
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
