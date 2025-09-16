"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const throttler_1 = require("./throttler");
class Queue extends throttler_1.Throttler {
    constructor(options) {
        super(options);
        this.cursor = 0;
        this.name = this.name || "queue";
    }
    hasWaitingTask() {
        return this.cursor !== this.total;
    }
    nextWaitingTaskIndex() {
        if (this.cursor >= this.total) {
            throw new Error("There is no more task in queue");
        }
        this.cursor++;
        return this.cursor - 1;
    }
}
exports.Queue = Queue;
exports.default = Queue;
