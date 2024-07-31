import * as express from "express";

import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";
import { TaskQueue } from "./taskQueue";

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

export class TaskQueueController {
  static UPDATE_TIMEOUT = 500;
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
        console.log(queue.getDebugInfo());
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
}

export class TasksEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private controller: TaskQueueController;

  constructor(private args: TasksEmulatorArgs) {
    this.controller = new TaskQueueController();
  }

  logger = EmulatorLogger.forEmulator(Emulators.TASKS);

  createHubServer(): express.Application {
    const hub = express();

    const createTaskQueueRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name`;
    const createTaskQueueHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      const key = `queue:${projectId}-${locationId}-${queueName}`;
      this.logger.logLabeled("SUCCESS", "tasks", `Created queue with key: ${key}`);
      const body = req.body as TaskQueueConfig;
      const taskQueueConfig: TaskQueueConfig = {
        retryConfig: {
          maxAttempts: body.retryConfig?.maxAttempts ?? 3,
          maxRetrySeconds: body.retryConfig?.maxRetrySeconds ?? null,
          maxBackoffSeconds: body.retryConfig?.maxBackoffSeconds ?? 60 * 60,
          maxDoublings: body.retryConfig?.maxDoublings ?? 16,
          minBackoffSeconds: body.retryConfig?.minBackoffSeconds ?? 0.1,
        },
        rateLimits: {
          maxConcurrentDispatches: body.rateLimits?.maxConcurrentDispatches ?? 1000,
          maxDispatchesPerSecond: body.rateLimits?.maxDispatchesPerSecond ?? 500,
        },
        timeoutSeconds: body.timeoutSeconds ?? 10,
        retry: body.retry ?? false,
        defaultUri: body.defaultUri,
      };

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
        res.send(404);
        return;
      }

      req.body.task.name =
        req.body.task.name ??
        `/projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
      req.body.task.httpRequest.body = JSON.parse(atob(req.body.task.httpRequest.body));

      const task = req.body.task as Task;

      try {
        this.controller.enqueue(queueKey, task);
      } catch (e) {
        res.status(409).send("A task with the same name already exists");
      }
      this.logger.log("DEBUG", `Enqueueing task ${task.name} onto ${queueKey}`);
      res.send({ task: task });
    };

    const deleteTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const deleteTasksHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      const taskId = req.params.task_id;
      const queueKey = `queue:${projectId}-${locationId}-${queueName}`;

      if (!this.controller.queues[queueKey]) {
        this.logger.log("WARN", "Tried to remove a task from a non-existant queue");
        res.send(404);
        return;
      }

      try {
        const taskName = `projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${taskId}`;
        this.logger.log("DEBUG", `removing: ${taskName}`);
        this.controller.delete(queueKey, taskName);
      } catch (e) {
        this.logger.log("WARN", "Tried to remove a task that doesn't exist");
        res.send(404);
      }
      res.send(200);
    };

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
