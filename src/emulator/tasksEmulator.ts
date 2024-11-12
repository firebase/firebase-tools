import * as express from "express";

import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";
import { TaskQueue } from "./taskQueue";
import * as cors from "cors";

export interface TasksEmulatorArgs {
  port?: number;
  host?: string;
}

export interface Task {
  name: string;
  // A timestamp in RFC3339 UTC "Zulu" format, with nanosecond resolution and up to nine fractional
  // digits. Examples: "2014-10-02T15:01:23Z" and "2014-10-02T15:01:23.045123456Z".
  scheduleTime?: string;
  // A duration in seconds with up to nine fractional digits, terminated by 's'. Example: "3.5s".
  dispatchDeadline?: string;
  httpRequest: {
    url: string;
    oidcToken?: {
      serviceAccountEmail: string;
    };
    body: any;
    headers: { [key: string]: string };
  };
}

export interface TaskQueueConfig {
  retryConfig: RetryConfig;
  rateLimits: RateLimits;
  timeoutSeconds: number;
  retry: boolean;
  defaultUri: string;

  // The configurations below this point do not currently have any effect on how the task queues are handled within the emulator
  secrets?: string[]; // TODO(gburroughs): look into how we can handle this
  region?: string | ResetValue;
  memory?: string | ResetValue;
  minInstances?: number | ResetValue;
  maxInstances?: number | ResetValue;
  concurrency?: number | ResetValue;
  labels?: Record<string, string>;
}

export interface RetryConfig {
  maxAttempts: number;
  maxRetrySeconds: number | null;
  maxBackoffSeconds: number;
  maxDoublings: number;
  minBackoffSeconds: number;
}

export interface RateLimits {
  maxConcurrentDispatches: number;
  maxDispatchesPerSecond: number;
}

type ResetValue = null;

const RETRY_CONFIG_DEFAULTS: RetryConfig = {
  maxAttempts: 3,
  maxRetrySeconds: null,
  maxBackoffSeconds: 60 * 60,
  maxDoublings: 16,
  minBackoffSeconds: 0.1,
};

const RATE_LIMITS_DEFAULT: RateLimits = {
  maxConcurrentDispatches: 1000,
  maxDispatchesPerSecond: 500,
};

/**
 * A controller class which manages:
 * - The creation of task queues
 * - Enqueueing tasks to the correct queue
 * - The timing for when task queue methods are run
 */
export class TaskQueueController {
  static UPDATE_TIMEOUT = 0;
  static LISTEN_TIMEOUT = 1000;
  static TOKEN_REFRESH_INTERVAL = 1000;
  queues: { [key: string]: TaskQueue } = {};
  private listenId: NodeJS.Timeout | null;
  private tokenRefillIds: NodeJS.Timeout[] = [];
  private running = false;

  constructor() {
    this.listenId = null;
  }

  enqueue(key: string, task: Task): void {
    if (!this.queues[key]) {
      throw new Error("Queue does not exist");
    }
    this.queues[key].enqueue(task);
  }

  delete(key: string, taskId: string): void {
    if (!this.queues[key]) {
      throw new Error("Queue does not exist");
    }
    this.queues[key].delete(taskId);
  }

  createQueue(key: string, config: TaskQueueConfig): void {
    const newQueue = new TaskQueue(key, config);
    const intervalID = setInterval(
      () => newQueue.refillTokens(),
      TaskQueueController.TOKEN_REFRESH_INTERVAL,
    );
    this.tokenRefillIds.push(intervalID);
    this.queues[key] = newQueue;
  }

  /**
   * If there are no active queues (a queue is active if it has tasks in the queue or dispatch) then
   * wait longer (1s) before checking the status of the queues again. If there are active queues,
   * continuously (1ms) call their methods to handle dispatching tasks
   */
  listen(): void {
    let shouldUpdate = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_key, queue] of Object.entries(this.queues)) {
      shouldUpdate = shouldUpdate || queue.isActive();
    }
    if (shouldUpdate) {
      this.updateQueues();
      this.listenId = setTimeout(() => this.listen(), TaskQueueController.UPDATE_TIMEOUT);
    } else {
      this.listenId = setTimeout(() => this.listen(), TaskQueueController.LISTEN_TIMEOUT);
    }
  }

  updateQueues(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_key, queue] of Object.entries(this.queues)) {
      if (queue.isActive()) {
        queue.dispatchTasks();
        queue.processDispatch();
      }
    }
  }

  start(): void {
    this.running = true;
    this.listen();
  }

  stop(): void {
    if (this.listenId) {
      clearTimeout(this.listenId);
    }
    this.tokenRefillIds.forEach(clearInterval);
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatistics() {
    const stats: Record<string, any> = {};
    for (const [key, queue] of Object.entries(this.queues)) {
      stats[key] = queue.getStatistics();
    }
    return stats;
  }
}

export class TasksEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private controller: TaskQueueController;

  constructor(private args: TasksEmulatorArgs) {
    this.controller = new TaskQueueController();
  }

  logger = EmulatorLogger.forEmulator(Emulators.TASKS);

  validateQueueId(queueId: string): boolean {
    if (typeof queueId !== "string") {
      return false;
    }

    if (queueId.length > 100) {
      return false;
    }

    const regex = /^[A-Za-z0-9-]+$/;
    return regex.test(queueId);
  }
  createHubServer(): express.Application {
    const hub = express();

    const createTaskQueueRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name`;
    const createTaskQueueHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      if (!this.validateQueueId(queueName)) {
        res.status(400).json({
          error:
            "Queue ID must start with a letter followed by up to 62 letters, numbers, " +
            "hyphens, or underscores and must end with a letter or a number",
        });
        return;
      }

      const key = `queue:${projectId}-${locationId}-${queueName}`;
      this.logger.logLabeled("SUCCESS", "tasks", `Created queue with key: ${key}`);
      const body = req.body as TaskQueueConfig;

      const taskQueueConfig: TaskQueueConfig = {
        retryConfig: {
          maxAttempts: body.retryConfig?.maxAttempts ?? RETRY_CONFIG_DEFAULTS.maxAttempts,
          maxRetrySeconds:
            body.retryConfig?.maxRetrySeconds ?? RETRY_CONFIG_DEFAULTS.maxRetrySeconds,
          maxBackoffSeconds:
            body.retryConfig?.maxBackoffSeconds ?? RETRY_CONFIG_DEFAULTS.maxBackoffSeconds,
          maxDoublings: body.retryConfig?.maxDoublings ?? RETRY_CONFIG_DEFAULTS.maxDoublings,
          minBackoffSeconds:
            body.retryConfig?.minBackoffSeconds ?? RETRY_CONFIG_DEFAULTS.minBackoffSeconds,
        },
        rateLimits: {
          maxConcurrentDispatches:
            body.rateLimits?.maxConcurrentDispatches ?? RATE_LIMITS_DEFAULT.maxConcurrentDispatches,
          maxDispatchesPerSecond:
            body.rateLimits?.maxDispatchesPerSecond ?? RATE_LIMITS_DEFAULT.maxDispatchesPerSecond,
        },
        timeoutSeconds: body.timeoutSeconds ?? 10,
        retry: body.retry ?? false,
        defaultUri: body.defaultUri,
      };
      if (taskQueueConfig.rateLimits.maxConcurrentDispatches > 5000) {
        res.status(400).json({ error: "cannot set maxConcurrentDispatches to a value over 5000" });
        return;
      }

      this.controller.createQueue(key, taskQueueConfig);
      this.logger.log(
        "DEBUG",
        `Created task queue ${key} with configuration: ${JSON.stringify(taskQueueConfig)}`,
      );

      res.status(200).send({ taskQueueConfig });
    };

    const enqueueTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks`;
    const enqueueTasksHandler: express.Handler = (req, res) => {
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
        req.body.task.name ??
        `/projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
      req.body.task.httpRequest.body = JSON.parse(atob(req.body.task.httpRequest.body));

      const task = req.body.task as Task;

      try {
        this.controller.enqueue(queueKey, task);
        this.logger.log("DEBUG", `Enqueueing task ${task.name} onto ${queueKey}`);
        res.status(200).send({ task: task });
      } catch (e) {
        res.status(409).send("A task with the same name already exists");
      }
    };

    const deleteTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const deleteTasksHandler: express.Handler = (req, res) => {
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
      } catch (e) {
        this.logger.log("WARN", "Tried to remove a task that doesn't exist");
        res.status(404).send("Tried to remove a task that doesn't exist");
      }
    };

    const getStatsRoute = `/queueStats`;
    const getStatsHandler: express.Handler = (req, res) => {
      res.json(this.controller.getStatistics());
    };

    hub.get([getStatsRoute], cors({ origin: true }), getStatsHandler);
    hub.post([createTaskQueueRoute], express.json(), createTaskQueueHandler);
    hub.post([enqueueTasksRoute], express.json(), enqueueTasksHandler);
    hub.delete([deleteTasksRoute], express.json(), deleteTasksHandler);

    return hub;
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const server = this.createHubServer().listen(port, host);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.destroyServer) {
      await this.destroyServer();
    }
    this.controller.stop();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.TASKS);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.TASKS;
  }
}
