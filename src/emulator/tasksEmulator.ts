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
    // A base64-encoded string.
    body: any;
    headers: { [key: string]: string };
  };
}

export interface EmulatedTask {
  data: Record<string, any>;
  task: Task;
  metadata?: EmulatedTaskMetadata;
}

export interface EmulatedTaskMetadata {
  currentAttempt: number;
  currentBackoff: number;
  startTime: number;
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
  private queuedIds: Set<string>;
  private queued;
  private listenId: NodeJS.Timeout | null;
  private refillId: NodeJS.Timeout | null;
  private retryIds: (NodeJS.Timeout | null)[];

  constructor(
    private key: string,
    private config: TaskQueueConfig,
  ) {
    this.maxTokens = Math.max(this.config.rateLimits.maxDispatchesPerSecond, 1.1);
    this.lastTokenUpdate = Date.now();
    this.queued = 0;
    this.listenId = null;
    this.refillId = null;
    this.retryIds = new Array<NodeJS.Timeout | null>(
      this.config.rateLimits.maxConcurrentDispatches,
    ).fill(null);
    this.queuedIds = new Set();
  }

  start(): void {
    this.listenForTasks();
    this.refillId = this.refillTokens();
  }

  // If the queue has no work to do (update it's token count or dispatch tasks) then wait longer before checking again
  listenForTasks(): void {
    if (!this.queue.isEmpty() || this.tokens < this.maxTokens) {
      this.handleTasks();
      this.listenId = setTimeout(() => this.listenForTasks(), 0);
    } else {
      this.listenId = setTimeout(() => this.listenForTasks(), TaskQueue.TASK_QUEUE_INTERVAL);
    }
  }

  refillTokens(): NodeJS.Timeout {
    return setInterval(() => {
      const tokensToAdd =
        ((Date.now() - this.lastTokenUpdate) / 1000) *
        this.config.rateLimits.maxDispatchesPerSecond;
      console.log({ tokensToAdd });
      console.log(this.tokens);
      this.tokens += tokensToAdd;
      this.tokens = Math.min(this.tokens, this.maxTokens);
      this.lastTokenUpdate = Date.now();
    }, 1000);
  }

  shouldDispatchTask(): boolean {
    return (
      !this.queue.isEmpty() &&
      this.queued < this.config.rateLimits.maxConcurrentDispatches &&
      this.tokens >= 1
    );
  }

  // Repeatedly process tasks in the queue
  handleTasks(): void {
    if (this.shouldDispatchTask()) {
      if (!EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
        this.logger.log(`DEBUG`, `Functions emulator not running!`);
        return;
      }

      const emulatedTask = this.queue.dequeue();
      this.logger.log("DEBUG", `dispatching ${emulatedTask.task.name}`);

      emulatedTask.metadata = {
        currentAttempt: 0,
        currentBackoff: this.config.retryConfig.minBackoffSeconds,
        startTime: Date.now(),
      };

      new Promise<boolean>((resolve, reject) => {
        this.tryTask(emulatedTask, this.config.retryConfig, this.queued, resolve, reject);
      })
        .then(() => {
          this.queued--;
          this.logger.logLabeled(
            `SUCCESS`,
            `Tasks`,
            `${emulatedTask.task.name} completed successfully`,
          );
        })
        .catch((e) => {
          console.error(e);
          this.logger.log(
            `WARN`,
            `Task ${emulatedTask.task.name} failed to be delivered successfully`,
          );
          this.queued--;
        });

      this.queued++;
      this.tokens--;
    }
  }

  enqueue(emulatedTask: EmulatedTask): void {
    if (this.queuedIds.has(emulatedTask.task.name)) {
      throw new Error("Duplicate ID attempted ot be queued");
    }
    this.queuedIds.add(emulatedTask.task.name);
    this.queue.enqueue(emulatedTask.task.name, emulatedTask);
  }

  remove(id: string): void {
    this.queue.remove(id);
  }

  tryTask(
    emulatedTask: EmulatedTask,
    retryOptions: RetryConfig,
    concurrentNumber: number,
    resolve: (value: boolean | PromiseLike<boolean>) => void,
    reject: (reason?: any) => void,
  ): void {
    const url =
      emulatedTask.task.httpRequest.url === ""
        ? this.config.defaultUri
        : emulatedTask.task.httpRequest.url;

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: emulatedTask.data }),
    })
      .then((res) => {
        if (res.status >= 200 && res.status < 300) {
          resolve(true);
        } else {
          this.logger.log(
            "WARN",
            `task: ${emulatedTask.task.name} failed: ${res.statusText} retrying ${JSON.stringify(emulatedTask.metadata)}`,
          );

          if (this.shouldStopRetrying(emulatedTask.metadata!, retryOptions)) {
            resolve(false);
            return;
          }

          this.retryIds[concurrentNumber] = setTimeout(
            () => this.tryTask(emulatedTask, retryOptions, concurrentNumber, resolve, reject),
            emulatedTask.metadata!.currentBackoff * 1000,
          );

          this.updateMetadata(emulatedTask.metadata!, retryOptions);
        }
      })
      .catch((e) => reject(e));
  }

  shouldStopRetrying(metadata: EmulatedTaskMetadata, retryOptions: RetryConfig): boolean {
    if (metadata.currentAttempt > retryOptions.maxAttempts) {
      if (retryOptions.maxRetrySeconds === null || retryOptions.maxRetrySeconds === 0) {
        return true;
      }
      if (Date.now() - metadata.startTime > retryOptions.maxRetrySeconds * 1000) {
        return true;
      }
    }
    return false;
  }

  updateMetadata(metadata: EmulatedTaskMetadata, retryOptions: RetryConfig): void {
    metadata.currentAttempt++;
    if (metadata.currentAttempt < retryOptions.maxDoublings) {
      metadata.currentBackoff *= 2;
    } else {
      metadata.currentBackoff += 1;
    }
    if (metadata.currentBackoff > retryOptions.maxBackoffSeconds) {
      metadata.currentBackoff = retryOptions.maxBackoffSeconds;
    }
  }

  stop() {
    if (this.listenId) {
      clearTimeout(this.listenId);
    }
    if (this.refillId) {
      clearInterval(this.refillId);
    }
    for (const retryId of this.retryIds) {
      if (retryId) {
        clearTimeout(retryId);
      }
    }
  }
}

export class TasksEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  constructor(private args: TasksEmulatorArgs) {}

  queues: { [key: string]: TaskQueue } = {};
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

      const tq = new TaskQueue(key, taskQueueConfig);
      tq.start();
      this.logger.log(
        "DEBUG",
        `Created task queue ${key} with configuration: ${JSON.stringify(taskQueueConfig)}`,
      );
      this.queues[key] = tq;

      res.status(200).send({ taskQueueConfig });
    };

    const enqueueTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks`;
    const enqueueTasksHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      const queueKey = `queue:${projectId}-${locationId}-${queueName}`;
      if (!this.queues[queueKey]) {
        this.logger.log("WARN", "Tried to queue a task into a non-existant queue");
        res.send(404);
        return;
      }
      req.body.task.name =
        req.body.task.name ??
        `/projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
      req.body.task.httpRequest.body = JSON.parse(atob(req.body.task.httpRequest.body));

      const task = req.body.task as Task;
      const targetQueue = this.queues[queueKey];
      const emulatedTask: EmulatedTask = {
        data: req.body.data ?? {},
        task: task,
      };
      try {
        targetQueue.enqueue(emulatedTask);
      } catch (e) {
        res.status(409).send("A task with the same name already exists");
      }
      this.logger.log("DEBUG", `Enqueueing task ${emulatedTask.task.name} onto ${queueKey}`);
      res.send({ task: emulatedTask });
    };

    const deleteTasksRoute = `/projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const deleteTasksHandler: express.Handler = (req, res) => {
      const projectId = req.params.project_id;
      const locationId = req.params.location_id;
      const queueName = req.params.queue_name;
      const taskId = req.params.task_id;
      const queueKey = `queue:${projectId}-${locationId}-${queueName}`;

      if (!this.queues[queueKey]) {
        this.logger.log("WARN", "Tried to remove a task from a non-existant queue");
        res.send(404);
        return;
      }

      const targetQueue = this.queues[queueKey];
      console.log(targetQueue.queue.getAll());
      try {
        const taskName = `projects/${projectId}/locations/${locationId}/queues/${queueName}/tasks/${taskId}`;
        console.log(`removing: ${taskName}`);
        targetQueue.remove(taskName);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_key, queue] of Object.entries(this.queues)) {
      queue.stop();
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
