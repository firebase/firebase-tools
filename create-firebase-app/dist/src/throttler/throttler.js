"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Throttler = exports.timeToWait = exports.backoff = void 0;
const logger_1 = require("../logger");
const retries_exhausted_error_1 = require("./errors/retries-exhausted-error");
const timeout_error_1 = require("./errors/timeout-error");
/**
 * Creates a promise to wait for the nth backoff.
 */
function backoff(retryNumber, delay, maxDelay) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeToWait(retryNumber, delay, maxDelay));
    });
}
exports.backoff = backoff;
// Exported for unit testing.
/**
 * time to wait between backoffs
 */
function timeToWait(retryNumber, delay, maxDelay) {
    return Math.min(delay * Math.pow(2, retryNumber), maxDelay);
}
exports.timeToWait = timeToWait;
function DEFAULT_HANDLER(task) {
    return task();
}
/**
 * Throttler is a task scheduler that throttles the maximum number of tasks running at the same time.
 * In the case of failure, it will retry with exponential backoff, until exceeding the retries limit.
 * T is the type of task. R is the type of the handler's result.
 * You can use throttler in two ways:
 * 1. Specify handler that is (T) => R.
 * 2. Not specify the handler, but T must be () => R.
 */
class Throttler {
    constructor(options) {
        this.name = "";
        this.concurrency = 200;
        this.handler = DEFAULT_HANDLER;
        this.active = 0;
        this.complete = 0;
        this.success = 0;
        this.errored = 0;
        this.retried = 0;
        this.total = 0;
        this.taskDataMap = new Map();
        this.waits = [];
        this.min = 9999999999;
        this.max = 0;
        this.avg = 0;
        this.retries = 0;
        this.backoff = 200;
        this.maxBackoff = 60000; // 1 minute
        this.closed = false;
        this.finished = false;
        this.startTime = 0;
        if (options.name) {
            this.name = options.name;
        }
        if (options.handler) {
            this.handler = options.handler;
        }
        if (typeof options.concurrency === "number") {
            this.concurrency = options.concurrency;
        }
        if (typeof options.retries === "number") {
            this.retries = options.retries;
        }
        if (typeof options.backoff === "number") {
            this.backoff = options.backoff;
        }
        if (typeof options.maxBackoff === "number") {
            this.maxBackoff = options.maxBackoff;
        }
    }
    /**
     * Return a promise that waits until the Throttler is closed and all tasks finish.
     */
    wait() {
        const p = new Promise((resolve, reject) => {
            this.waits.push({ resolve, reject });
        });
        return p;
    }
    /**
     * Add the task to the throttler.
     * When the task is completed, resolve will be called with handler's result.
     * If this task fails after retries, reject will be called with the error.
     */
    add(task, timeoutMillis) {
        this.addHelper(task, timeoutMillis);
    }
    /**
     * Add the task to the throttler and return a promise of handler's result.
     * If the task failed, both the promised returned by throttle and wait will reject.
     */
    run(task, timeoutMillis) {
        return new Promise((resolve, reject) => {
            this.addHelper(task, timeoutMillis, { resolve, reject });
        });
    }
    /**
     * Signal that no more tasks will be added to the throttler, but any tasks already added to the
     * throttler will continue to run
     */
    close() {
        this.closed = true;
        return this.finishIfIdle();
    }
    process() {
        if (this.finishIfIdle() || this.active >= this.concurrency || !this.hasWaitingTask()) {
            return;
        }
        this.active++;
        this.handle(this.nextWaitingTaskIndex());
    }
    async handle(cursorIndex) {
        const taskData = this.taskDataMap.get(cursorIndex);
        if (!taskData) {
            throw new Error(`taskData.get(${cursorIndex}) does not exist`);
        }
        const promises = [this.executeTask(cursorIndex)];
        if (taskData.timeoutMillis) {
            promises.push(this.initializeTimeout(cursorIndex));
        }
        let result;
        try {
            result = await Promise.race(promises);
        }
        catch (err) {
            this.errored++;
            this.complete++;
            this.active--;
            this.onTaskFailed(err, cursorIndex);
            return;
        }
        this.success++;
        this.complete++;
        this.active--;
        this.onTaskFulfilled(result, cursorIndex);
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
            total: this.total,
            elapsed: Date.now() - this.startTime,
        };
    }
    taskName(cursorIndex) {
        const taskData = this.taskDataMap.get(cursorIndex);
        if (!taskData) {
            return "finished task";
        }
        return typeof taskData.task === "string" ? taskData.task : `index ${cursorIndex}`;
    }
    addHelper(task, timeoutMillis, wait) {
        if (this.closed) {
            throw new Error("Cannot add a task to a closed throttler.");
        }
        if (!this.startTime) {
            this.startTime = Date.now();
        }
        this.taskDataMap.set(this.total, {
            task,
            wait,
            timeoutMillis,
            retryCount: 0,
            isTimedOut: false,
        });
        this.total++;
        this.process();
    }
    finishIfIdle() {
        if (this.closed && !this.hasWaitingTask() && this.active === 0) {
            this.finish();
            return true;
        }
        return false;
    }
    finish(err) {
        this.waits.forEach((p) => {
            if (err) {
                return p.reject(err);
            }
            this.finished = true;
            return p.resolve();
        });
    }
    initializeTimeout(cursorIndex) {
        const taskData = this.taskDataMap.get(cursorIndex);
        const timeoutMillis = taskData.timeoutMillis;
        const timeoutPromise = new Promise((_, reject) => {
            taskData.timeoutId = setTimeout(() => {
                taskData.isTimedOut = true;
                reject(new timeout_error_1.default(this.taskName(cursorIndex), timeoutMillis));
            }, timeoutMillis);
        });
        return timeoutPromise;
    }
    async executeTask(cursorIndex) {
        const taskData = this.taskDataMap.get(cursorIndex);
        const t0 = Date.now();
        let result;
        try {
            result = await this.handler(taskData.task);
        }
        catch (err) {
            if (taskData.retryCount === this.retries) {
                throw new retries_exhausted_error_1.default(this.taskName(cursorIndex), this.retries, err);
            }
            await backoff(taskData.retryCount + 1, this.backoff, this.maxBackoff);
            if (taskData.isTimedOut) {
                throw new timeout_error_1.default(this.taskName(cursorIndex), taskData.timeoutMillis);
            }
            this.retried++;
            taskData.retryCount++;
            logger_1.logger.debug(`[${this.name}] Retrying task`, this.taskName(cursorIndex));
            return this.executeTask(cursorIndex);
        }
        if (taskData.isTimedOut) {
            throw new timeout_error_1.default(this.taskName(cursorIndex), taskData.timeoutMillis);
        }
        const dt = Date.now() - t0;
        this.min = Math.min(dt, this.min);
        this.max = Math.max(dt, this.max);
        this.avg = (this.avg * this.complete + dt) / (this.complete + 1);
        return result;
    }
    onTaskFulfilled(result, cursorIndex) {
        const taskData = this.taskDataMap.get(cursorIndex);
        if (taskData.wait) {
            taskData.wait.resolve(result);
        }
        this.cleanupTask(cursorIndex);
        this.process();
    }
    onTaskFailed(error, cursorIndex) {
        const taskData = this.taskDataMap.get(cursorIndex);
        logger_1.logger.debug(error);
        if (taskData.wait) {
            taskData.wait.reject(error);
        }
        this.cleanupTask(cursorIndex);
        this.finish(error);
    }
    cleanupTask(cursorIndex) {
        const { timeoutId } = this.taskDataMap.get(cursorIndex);
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        this.taskDataMap.delete(cursorIndex);
    }
}
exports.Throttler = Throttler;
