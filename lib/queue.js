"use strict";

const logger = require("./logger");

class Queue {
  constructor(options) {
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
    this.tasks = [];
    this.waits = [];
    this.min = 9999999999;
    this.max = 0;
    this.avg = 0;
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
      return Promise.resolve();
    }

    const t0 = Date.now();
    const task = this.tasks[this.cursor];
    this.cursor++;
    this.active++;
    const self = this;
    return this.handler(task)
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
        self.errored++;
        self.complete++;
        self.active--;
        logger.debug("[queue] Error on task", task, ":", err);
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
    this.waits.forEach(function(p) {
      if (err) {
        return p.reject(err);
      }
      return p.resolve();
    });
  }
}

module.exports = Queue;
