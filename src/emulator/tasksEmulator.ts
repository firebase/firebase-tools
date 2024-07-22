import * as express from "express";

import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorRegistry } from "./registry";
import { Queue } from "./taskQueue";

export interface TasksEmulatorArgs {
  port?: number;
  host?: string;
}

export interface EmulatedTask {
  data: Record<string, any>;
  options: TaskOptions;
  runningInfo?: {
    currentAttempt: number;
    currentBackoff: number;
    startTime: number;
  };
}

export interface TaskOptions {
  dispatchedDeadlineSeconds?: number;
  id?: string;
  headers?: Record<string, string>;
  uri?: string;
  // Can only have one of the following
  scheduleDelaySeconds?: number;
  scheduleTime?: number;
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

export class TaskQueue {
  queue: Queue<EmulatedTask> = new Queue<EmulatedTask>();
  logger = EmulatorLogger.forEmulator(Emulators.TASKS);
  static TASK_QUEUE_INTERVAL = 1000;
  tokens = 0;
  private maxTokens;
  private lastTokenUpdate;
  private queued;

  constructor(
    private key: string,
    private config: TaskQueueConfig,
  ) {
    this.maxTokens = this.config.rateLimits.maxDispatchesPerSecond; // TODO(gburroughs): Look into the burst size
    this.lastTokenUpdate = Date.now();
    this.queued = 0;
  }

  start() {
    this.listenForTasks();
  }

  // If the queue has no work to do (update it's token count or dispatch tasks) then wait longer before checking again
  listenForTasks(): void {
    this.logger.log(`DEBUG`, `[${this.key}] Listing for tasks...`);
    if (!this.queue.isEmpty() || this.tokens < this.maxTokens) {
      this.handleTasks();
      setTimeout(() => this.listenForTasks(), 0);
    } else {
      setTimeout(() => this.listenForTasks(), TaskQueue.TASK_QUEUE_INTERVAL);
    }
  }

  // Repeatedly process tasks in the queue
  handleTasks(): void {
    if (Date.now() - this.lastTokenUpdate > 1000 / this.config.rateLimits.maxDispatchesPerSecond) {
      this.tokens++;
      this.lastTokenUpdate = Date.now();
    }

    if (
      this.tokens > 0 &&
      !this.queue.isEmpty() &&
      this.queued < this.config.rateLimits.maxConcurrentDispatches
    ) {
      if (!EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
        this.logger.log(`DEBUG`, `Functions emulator not running!`);
        return;
      }

      const task = this.queue.dequeue()!;
      task.runningInfo = {
        currentAttempt: 0,
        currentBackoff: this.config.retryConfig.minBackoffSeconds,
        startTime: Date.now(),
      };

      new Promise<boolean>((resolve, reject) => {
        this.tryTask(task, this.config.retryConfig, resolve, reject);
        this.queued--;
      })
        .then((res) => {
          this.queued--;
          console.log(res);
        })
        .catch((e) => {
          console.error(e);
          this.queued--;
        });

      this.queued++;
      this.tokens--;
    }
  }

  enqueue(task: EmulatedTask): void {
    this.queue.enqueue(task.options.id!, task);
  }

  tryTask(
    task: EmulatedTask,
    retryOptions: RetryConfig,
    resolve: (value: boolean | PromiseLike<boolean>) => void,
    reject: (reason?: any) => void,
  ): void {
    fetch(task.options.uri || this.config.defaultUri, {
      method: "POST", // TODO(gburroughs): Is this always the case?
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: task.data }),
    })
      .then((res) => {
        if (res.status >= 200 && res.status < 300) {
          resolve(true);
        } else {
          this.logger.log(
            "WARN",
            `task: ${task.options.id} failed: ${res.statusText} retrying ${JSON.stringify(task.runningInfo)}`,
          );

          if (task.runningInfo!.currentAttempt > retryOptions.maxAttempts) {
            if (retryOptions.maxRetrySeconds === null || retryOptions.maxRetrySeconds === 0) {
              resolve(false);
              return;
            } else if (
              Date.now() - task.runningInfo!.startTime >
              retryOptions.maxRetrySeconds * 1000
            ) {
              resolve(false);
              return;
            }
          }
          setTimeout(
            () => this.tryTask(task, retryOptions, resolve, reject),
            task.runningInfo!.currentBackoff * 1000,
          );

          task.runningInfo!.currentAttempt++;
          // Update Parameters
          if (task.runningInfo!.currentAttempt < retryOptions.maxDoublings) {
            task.runningInfo!.currentBackoff *= 2;
          } else {
            task.runningInfo!.currentBackoff += 1; // TODO(gburroughs): Figure out what this should be
          }
          if (task.runningInfo!.currentBackoff > retryOptions.maxBackoffSeconds) {
            task.runningInfo!.currentBackoff = retryOptions.maxBackoffSeconds;
          }
        }
      })
      .catch((e) => reject(e));
  }
}

export class TasksEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  constructor(private args: TasksEmulatorArgs) {}

  queues: { [key: string]: TaskQueue } = {};
  logger = EmulatorLogger.forEmulator(Emulators.TASKS);

  createHubServer(): express.Application {
    const hub = express();

    this.logger.log("INFO", `Running Queue Hub Setup Code`);

    const createTaskQueueRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name`;
    const createTaskQueueHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      const key = `queue:${projectId}-${locationId}-${queueName}`;
      this.logger.log("INFO", `Created queue with key: ${key}: ${JSON.stringify(req.body)}`);
      const taskQueueConfig: TaskQueueConfig = {
        retryConfig: {
          maxAttempts: (req.body.retryConfig?.maxAttempts as number) ?? 3,
          maxRetrySeconds: (req.body.retryConfig?.maxRetrySeconds as number) ?? null, // TODO(gburroughs): is this okay?
          maxBackoffSeconds: (req.body.retryConfig?.maxBackoffSeconds as number) ?? 60 * 60,
          maxDoublings: (req.body.retryConfig?.maxDoublings as number) ?? 16,
          minBackoffSeconds: (req.body.retryConfig?.minBackoffSeconds as number) ?? 0.1,
        },
        rateLimits: {
          maxConcurrentDispatches: (req.body.rateLimits?.maxConcurrentDispatches as number) ?? 1000,
          maxDispatchesPerSecond: (req.body.rateLimits?.maxDispatchesPerSecond as number) ?? 500,
        },
        timeoutSeconds: (req.body.timeoutSeconds as number) ?? 10,
        retry: (req.body.retry as boolean) ?? false,
        defaultUri: req.body.defaultUri! as string,
      };

      const tq = new TaskQueue(key, taskQueueConfig);
      tq.start();
      this.queues[key] = tq;

      res.status(200).send({ taskQueueConfig });
    };

    const enqueueTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const enqueueTasksHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      const taskId = req.params.task_id;
      const queueKey = `queue:${projectId}-${locationId}-${queueName}`;
      if (!this.queues[queueKey]) {
        this.logger.log("WARN", "Tried to queue a task into a non-existant queue");
        res.send(404);
        return;
      }
      const targetQueue = this.queues[queueKey];
      const task: EmulatedTask = {
        data: req.body.data ?? {},
        options: {
          dispatchedDeadlineSeconds:
            (req.body?.options?.dispatchedDeadlineSeconds as number) ?? undefined,
          id: taskId ?? null,
          headers: req.body.options?.headers ?? {},
          uri: req.body.options?.uri ?? null,
          // Can only have one of the following
          scheduleDelaySeconds: undefined,
          scheduleTime: undefined,
        },
      };
      targetQueue.enqueue(task);
      this.logger.log("INFO", `Enqueueing task ${taskId} onto ${queueKey}`);
      res.send({ task });
    };

    const deleteTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const deleteTasksHandler: express.Handler = (req, res) => {
      res.send(200);
    };

    hub.post([createTaskQueueRoute], express.json(), createTaskQueueHandler);
    hub.post([enqueueTasksRoute], express.json(), enqueueTasksHandler);
    hub.delete([deleteTasksRoute], express.json(), deleteTasksHandler);

    return hub;
  }

  async start(): Promise<void> {
    console.log("Staring Queue Hub");
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
