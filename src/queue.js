"use strict";

const logger = require("./logger");

function _backoff(retryNumber, delay) {
  return new Promise(function(resolve) {
    setTimeout(resolve, delay * Math.pow(2, retryNumber));
  });
}

class Queue {
  constructor(options) {
    this.name = options.name || "queue";
    this.concurrency = options.concurrency || 1;
    this.handler =
      options.handler ||
      function(task) {
        return task();
      };
    this.cursor = 0;
    this.active = 0;
    this.complete = 0;
    this.success = 0;
    this.errored = 0;
    this.retried = 0;
    this.tasks = [];
    this.waits = [];
    this.min = 9999999999;
    this.max = 0;
    this.avg = 0;
    this.retries = options.retries || 0;
    this.backoff = typeof options.backoff == "number" ? options.backoff : 200;
    this.retryCounts = {};
    this.closed = false;
    this.finished = false;
  }

  taskName(cursorIndex) {
    const task = this.tasks[cursorIndex];
    return typeof task === "string" ? task : "index " + cursorIndex;
  }

  wait() {
    const self = this;
    const p = new Promise(function(resolve, reject) {
      self.waits.push({ resolve: resolve, reject: reject });
    });
    return p;
  }

  add(task) {
    if (!this.startTime) {
      this.startTime = Date.now();
    }

    if (this.closed) {
      throw new Error("Cannot add a task to a closed queue.");
    }
    this.tasks.push(task);
    this.process();
  }

  close() {
    this.closed = true;
    this._finishIfIdle();
  }

  process() {
    if (
      this._finishIfIdle() ||
      this.active >= this.concurrency ||
      this.cursor === this.tasks.length
    ) {
      return;
    }

    this.cursor++;
    this.active++;
    this.handle(this.cursor - 1);
  }

  handle(cursorIndex) {
    const task = this.tasks[cursorIndex];
    const t0 = Date.now();
    const self = this;
    this.handler(task)
      .then(function() {
        const dt = Date.now() - t0;
        if (dt < self.min) {
          self.min = dt;
        }
        if (dt > self.max) {
          self.max = dt;
        }
        self.avg = (self.avg * self.complete + dt) / (self.complete + 1);

        self.success++;
        self.complete++;
        self.active--;
        self.process();
      })
      .catch(function(err) {
        if (self.retries > 0) {
          self.retryCounts[cursorIndex] = self.retryCounts[cursorIndex] || 0;
          if (self.retryCounts[cursorIndex] < self.retries) {
            self.retryCounts[cursorIndex]++;
            self.retried++;
            return _backoff(self.retryCounts[cursorIndex], self.backoff).then(function() {
              logger.debug("[" + self.name + "] Retrying task", self.taskName(cursorIndex));
              return self.handle(cursorIndex);
            });
          }
        }

        self.errored++;
        self.complete++;
        self.active--;
        if (self.retryCounts[cursorIndex] > 0) {
          logger.debug(
            "[" + self.name + "] Retries exhausted for task",
            self.taskName(cursorIndex),
            ":",
            err
          );
        } else {
          logger.debug("[" + self.name + "] Error on task", self.taskName(cursorIndex), ":", err);
        }
        self._finish(err);
      });
  }

  stats() {
    return {
      max: this.max,
      min: this.min,
      avg: this.avg,
      active: this.active,
      complete: this.complete,
      success: this.success,
      errored: this.errored,
      retried: this.retried,
      total: this.tasks.length,
      elapsed: Date.now() - this.startTime,
    };
  }

  _finishIfIdle() {
    if (this.closed && this.cursor == this.tasks.length && this.active === 0) {
      this._finish();
      return true;
    }

    return false;
  }

  _finish(err) {
    var self = this;
    this.waits.forEach(function(p) {
      if (err) {
        return p.reject(err);
      }
      self.finished = true;
      return p.resolve();
    });
  }
}

module.exports = Queue;
