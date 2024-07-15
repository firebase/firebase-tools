import * as express from "express";

import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";

export interface TasksEmulatorArgs {
  port?: number;
  host?: string;
}

export interface EmulatedTask {
  data: Record<string, any>;
  options: TaskOptions;
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

export interface EmulatedTaskQueue {
  queue: EmulatedTask[];
  retryConfig?: RetryConfig;
  rateLimits?: RateLimits;
  timeoutSeconds?: number | ResetValue;
  retry?: boolean;

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
  maxAttempts?: number | ResetValue;
  maxRetrySeconds?: number | ResetValue;
  maxBackoffSeconds?: number | ResetValue;
  maxDoublings?: number | ResetValue;
  minBackoffSeconds?: number | ResetValue;
}

export interface RateLimits {
  maxConcurrentDispatches?: number | ResetValue;
  maxDispatchesPerSecond?: number | ResetValue;
}

type ResetValue = null;

export class TasksEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  constructor(private args: TasksEmulatorArgs) {}

  queues: { [key: string]: EmulatedTask[] } = {};

  createHubServer(): express.Application {
    const hub = express();

    const createTaskQueueRoute = `projects/:project_id/locations/:location_id/queues/:queue_name`;
    const createTaskQueueHandler: express.Handler = (request, response) => {
      response.send(200);
    };

    const enqueueTasksRoute = `projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const enqueueTasksHandler: express.Handler = (request, response) => {
      response.send(200);
    };

    const deleteTasksRoute = `projects/:project_id/locations/:location_id/queues/:queue_name/tasks/:task_id`;
    const deleteTasksHandler: express.Handler = (request, response) => {
      response.send(200);
    };

    hub.post([createTaskQueueRoute], createTaskQueueHandler);
    hub.post([enqueueTasksRoute], enqueueTasksHandler);
    hub.delete([deleteTasksRoute], deleteTasksHandler);

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
