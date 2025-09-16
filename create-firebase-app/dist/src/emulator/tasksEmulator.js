"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksEmulator = exports.TaskQueueController = void 0;
const express = require("express");
const constants_1 = require("./constants");
const types_1 = require("./types");
const utils_1 = require("../utils");
const emulatorLogger_1 = require("./emulatorLogger");
const taskQueue_1 = require("./taskQueue");
const cors = require("cors");
const RETRY_CONFIG_DEFAULTS = {
    maxAttempts: 3,
    maxRetrySeconds: null,
    maxBackoffSeconds: 60 * 60,
    maxDoublings: 16,
    minBackoffSeconds: 0.1,
};
const RATE_LIMITS_DEFAULT = {
    maxConcurrentDispatches: 1000,
    maxDispatchesPerSecond: 500,
};
/**
 * A controller class which manages:
 * - The creation of task queues
 * - Enqueueing tasks to the correct queue
 * - The timing for when task queue methods are run
 */
class TaskQueueController {
    constructor() {
        this.queues = {};
        this.tokenRefillIds = [];
        this.running = false;
        this.listenId = null;
    }
    enqueue(key, task) {
        if (!this.queues[key]) {
            throw new Error("Queue does not exist");
        }
        this.queues[key].enqueue(task);
    }
    delete(key, taskId) {
        if (!this.queues[key]) {
            throw new Error("Queue does not exist");
        }
        this.queues[key].delete(taskId);
    }
    createQueue(key, config) {
        const newQueue = new taskQueue_1.TaskQueue(key, config);
        const intervalID = setInterval(() => newQueue.refillTokens(), TaskQueueController.TOKEN_REFRESH_INTERVAL);
        this.tokenRefillIds.push(intervalID);
        this.queues[key] = newQueue;
    }
    /**
     * If there are no active queues (a queue is active if it has tasks in the queue or dispatch) then
     * wait longer (1s) before checking the status of the queues again. If there are active queues,
     * continuously (1ms) call their methods to handle dispatching tasks
     */
    listen() {
        let shouldUpdate = false;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [_key, queue] of Object.entries(this.queues)) {
            shouldUpdate = shouldUpdate || queue.isActive();
        }
        if (shouldUpdate) {
            this.updateQueues();
            this.listenId = setTimeout(() => this.listen(), TaskQueueController.UPDATE_TIMEOUT);
        }
        else {
            this.listenId = setTimeout(() => this.listen(), TaskQueueController.LISTEN_TIMEOUT);
        }
    }
    updateQueues() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [_key, queue] of Object.entries(this.queues)) {
            if (queue.isActive()) {
                queue.dispatchTasks();
                queue.processDispatch();
            }
        }
    }
    start() {
        this.running = true;
        this.listen();
    }
    stop() {
        if (this.listenId) {
            clearTimeout(this.listenId);
        }
        this.tokenRefillIds.forEach(clearInterval);
        this.running = false;
    }
    isRunning() {
        return this.running;
    }
    getStatistics() {
        const stats = {};
        for (const [key, queue] of Object.entries(this.queues)) {
            stats[key] = queue.getStatistics();
        }
        return stats;
    }
}
exports.TaskQueueController = TaskQueueController;
TaskQueueController.UPDATE_TIMEOUT = 0;
TaskQueueController.LISTEN_TIMEOUT = 1000;
TaskQueueController.TOKEN_REFRESH_INTERVAL = 1000;
class TasksEmulator {
    constructor(args) {
        this.args = args;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.TASKS);
        this.controller = new TaskQueueController();
    }
    validateQueueId(queueId) {
        if (typeof queueId !== "string") {
            return false;
        }
        if (queueId.length > 100) {
            return false;
        }
        const regex = /^[A-Za-z0-9-]+$/;
        return regex.test(queueId);
    }
    createHubServer() {
        const hub = express();
        const createTaskQueueRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name`;
        const createTaskQueueHandler = (req, res) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
            const projectId = req.params.project_id;
            const locationId = req.params.location_id;
            const queueName = req.params.queue_name;
            if (!this.validateQueueId(queueName)) {
                res.status(400).json({
                    error: "Queue ID must start with a letter followed by up to 62 letters, numbers, " +
                        "hyphens, or underscores and must end with a letter or a number",
                });
                return;
            }
            const key = `queue:${projectId}-${locationId}-${queueName}`;
            this.logger.logLabeled("SUCCESS", "tasks", `Created queue with key: ${key}`);
            const body = req.body;
            const taskQueueConfig = {
                retryConfig: {
                    maxAttempts: (_b = (_a = body.retryConfig) === null || _a === void 0 ? void 0 : _a.maxAttempts) !== null && _b !== void 0 ? _b : RETRY_CONFIG_DEFAULTS.maxAttempts,
                    maxRetrySeconds: (_d = (_c = body.retryConfig) === null || _c === void 0 ? void 0 : _c.maxRetrySeconds) !== null && _d !== void 0 ? _d : RETRY_CONFIG_DEFAULTS.maxRetrySeconds,
                    maxBackoffSeconds: (_f = (_e = body.retryConfig) === null || _e === void 0 ? void 0 : _e.maxBackoffSeconds) !== null && _f !== void 0 ? _f : RETRY_CONFIG_DEFAULTS.maxBackoffSeconds,
                    maxDoublings: (_h = (_g = body.retryConfig) === null || _g === void 0 ? void 0 : _g.maxDoublings) !== null && _h !== void 0 ? _h : RETRY_CONFIG_DEFAULTS.maxDoublings,
                    minBackoffSeconds: (_k = (_j = body.retryConfig) === null || _j === void 0 ? void 0 : _j.minBackoffSeconds) !== null && _k !== void 0 ? _k : RETRY_CONFIG_DEFAULTS.minBackoffSeconds,
                },
                rateLimits: {
                    maxConcurrentDispatches: (_m = (_l = body.rateLimits) === null || _l === void 0 ? void 0 : _l.maxConcurrentDispatches) !== null && _m !== void 0 ? _m : RATE_LIMITS_DEFAULT.maxConcurrentDispatches,
                    maxDispatchesPerSecond: (_p = (_o = body.rateLimits) === null || _o === void 0 ? void 0 : _o.maxDispatchesPerSecond) !== null && _p !== void 0 ? _p : RATE_LIMITS_DEFAULT.maxDispatchesPerSecond,
                },
                timeoutSeconds: (_q = body.timeoutSeconds) !== null && _q !== void 0 ? _q : 10,
                retry: (_r = body.retry) !== null && _r !== void 0 ? _r : false,
                defaultUri: body.defaultUri,
            };
            if (taskQueueConfig.rateLimits.maxConcurrentDispatches > 5000) {
                res.status(400).json({ error: "cannot set maxConcurrentDispatches to a value over 5000" });
                return;
            }
            this.controller.createQueue(key, taskQueueConfig);
            this.logger.log("DEBUG", `Created task queue ${key} with configuration: ${JSON.stringify(taskQueueConfig)}`);
            res.status(200).send({ taskQueueConfig });
        };
        const enqueueTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks`;
        const enqueueTasksHandler = (req, res) => {
            var _a;
            if (!this.controller.isRunning()) {
                this.controller.start();
            }
            const projectId = req.params.project_id;
            const locationId = req.params.location_id;
            const queueName = req.params.queue_name;
            const queueKey = `queue:${projectId}-${locationId}-${queueName}`;
            if (!this.controller.queues[queueKey]) {
                this.logger.log("WARN", "Tried to queue a task into a non-existent queue");
                res.status(404).send("Tried to queue a task from a non-existent queue");
                return;
            }
            req.body.task.name =
                (_a = req.body.task.name) !== null && _a !== void 0 ? _a : `/projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
            req.body.task.httpRequest.body = JSON.parse(Buffer.from(req.body.task.httpRequest.body, "base64").toString("utf-8"));
            const task = req.body.task;
            try {
                this.controller.enqueue(queueKey, task);
                this.logger.log("DEBUG", `Enqueueing task ${task.name} onto ${queueKey}`);
                res.status(200).send({ task: task });
            }
            catch (e) {
                res.status(409).send("A task with the same name already exists");
            }
        };
        const deleteTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
        const deleteTasksHandler = (req, res) => {
            const projectId = req.params.project_id;
            const locationId = req.params.location_id;
            const queueName = req.params.queue_name;
            const taskId = req.params.task_id;
            const queueKey = `queue:${projectId}-${locationId}-${queueName}`;
            if (!this.controller.queues[queueKey]) {
                this.logger.log("WARN", "Tried to remove a task from a non-existent queue");
                res.status(404).send("Tried to remove a task from a non-existent queue");
                return;
            }
            try {
                const taskName = `projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${taskId}`;
                this.logger.log("DEBUG", `removing: ${taskName}`);
                this.controller.delete(queueKey, taskName);
                res.status(200).send({ res: "OK" });
            }
            catch (e) {
                this.logger.log("WARN", "Tried to remove a task that doesn't exist");
                res.status(404).send("Tried to remove a task that doesn't exist");
            }
        };
        const getStatsRoute = `/queueStats`;
        const getStatsHandler = (req, res) => {
            res.json(this.controller.getStatistics());
        };
        hub.get([getStatsRoute], cors({ origin: true }), getStatsHandler);
        hub.post([createTaskQueueRoute], express.json(), createTaskQueueHandler);
        hub.post([enqueueTasksRoute], express.json(), enqueueTasksHandler);
        hub.delete([deleteTasksRoute], express.json(), deleteTasksHandler);
        return hub;
    }
    async start() {
        const { host, port } = this.getInfo();
        const server = this.createHubServer().listen(port, host);
        this.destroyServer = (0, utils_1.createDestroyer)(server);
        return Promise.resolve();
    }
    async connect() {
        return Promise.resolve();
    }
    async stop() {
        if (this.destroyServer) {
            await this.destroyServer();
        }
        this.controller.stop();
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.TASKS);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.TASKS;
    }
}
exports.TasksEmulator = TasksEmulator;
