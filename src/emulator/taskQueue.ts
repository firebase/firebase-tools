/* eslint-disable prettier/prettier */
import { EmulatorLogger } from "./emulatorLogger";
import { RetryConfig, Task, TaskQueueConfig } from "./tasksEmulator";
import { Emulators } from "./types";
import fetch from 'node-fetch';

class Node<T> {
  public data: T;
  public next: Node<T> | null;
  public prev: Node<T> | null;

  constructor(data: T) {
    this.data = data;
    this.next = null;
    this.prev = null;
  }
}

// A FIFO queue that supports enqueueing, dequeueing, and deleting elements in O(1) time.
export class Queue<T> {
  private first: Node<T> | null;
  private last: Node<T> | null;
  private nodeMap: Record<string, Node<T>> = {};
  private capacity;
  private count = 0;

  constructor(capacity = 10000) {
    this.first = null;
    this.last = null;
    this.capacity = capacity;
  }

  enqueue(id: string, item: T): void {
    if (this.count >= this.capacity) {
      throw new Error("Queue has reached capacity");
    }

    const newNode = new Node(item);
    if (this.nodeMap[id] !== undefined) {
      throw new Error("Queue IDs must be unique");
    }
    this.nodeMap[id] = newNode;
    if (!this.first) {
      this.first = newNode;
    }
    if (this.last) {
      this.last.next = newNode;
    }
    newNode.prev = this.last;
    this.last = newNode;

    this.count++;
  }

  peek(): T {
    if (this.first) {
      return this.first.data;
    } else {
      throw new Error("Trying to peek into an empty queue");
    }
  }

  dequeue(): T {
    if (this.first) {
      const currentFirst = this.first;
      this.first = this.first.next;
      if (this.last === currentFirst) {
        this.last = null;
      }
      this.count--;
      return currentFirst.data;
    } else {
      throw new Error("Trying to dequeue from an empty queue");
    }
  }

  remove(id: string): void {
    if (this.nodeMap[id] === undefined) {
      throw new Error("Trying to remove a task that doesn't exist");
    }
    const toRemove = this.nodeMap[id];

    if (toRemove.next === null && toRemove.prev === null) {
      this.first = null;
      this.last = null;
    } else if (toRemove.next === null) {
      this.last = toRemove.prev;
      toRemove.prev!.next = null;
    } else if (toRemove.prev === null) {
      this.first = toRemove.next;
      toRemove.next.prev = null;
    } else {
      const prev = toRemove.prev;
      const next = toRemove.next;
      prev.next = next;
      next.prev = prev;
    }
    delete this.nodeMap[id];
    this.count--;
  }

  getAll(): T[] {
    const all = [];
    let curr = this.first;
    while (curr) {
      all.push(curr.data);
      curr = curr.next;
    }
    return all;
  }

  isEmpty(): boolean {
    return this.first === null;
  }

  size(): number {
    return this.count;
  }
}

export enum TaskStatus {
  // When a task has been created/retried and should check if it should run
  NOT_STARTED,
  // When a task has been dispatched and is currently running
  RUNNING,
  // When a task has been dispatched and failed, but will be tried again
  RETRY,
  // When a task has failed and exhausted it's retry parameters and will not be tried again.
  FAILED,
  // When a task has been completed successfully
  FINISHED,
}

export interface EmulatedTaskMetadata {
  currentAttempt: number;
  currentBackoff: number;
  startTime: number;
  status: TaskStatus;
  lastRunTime: number | null;
}

export interface EmulatedTask {
  task: Task;
  metadata: EmulatedTaskMetadata;
}

export class TaskQueue {
  queue: Queue<EmulatedTask> = new Queue<EmulatedTask>();
  logger = EmulatorLogger.forEmulator(Emulators.TASKS);
  static TASK_QUEUE_INTERVAL = 1000;

  // Current number of tokens the queue has
  private tokens = 0;
  // The maximum number of tokens that can fit in the "bucket"
  private maxTokens;
  // The last time the token bucket was updated, used in calculations of how many tokens to add.
  private lastTokenUpdate;
  // The IDs of all the tasks ever queued in this session to allow for deduplication
  private queuedIds: Set<string>;
  // The tasks that have been dispatched that the queue is waiting on
  private dispatches: (EmulatedTask | null)[];
  // The indexes of the open slots in the dispatch array
  private openDispatches: number[];

  constructor(
    private key: string,
    private config: TaskQueueConfig,
  ) {
    this.maxTokens = Math.max(this.config.rateLimits.maxDispatchesPerSecond, 1.1);
    this.lastTokenUpdate = Date.now();
    this.queuedIds = new Set();
    this.dispatches = new Array<EmulatedTask | null>(
      this.config.rateLimits.maxConcurrentDispatches,
    ).fill(null);
    this.openDispatches = Array.from(this.dispatches.keys());
  }

  // Moves tasks from the queue to the dispatch if the following requirements are met:
  //  - There are tasks within the queue
  //  - There is space in the dispatch
  //  - There are tokens available (used for rate limiting)

  dispatchTasks(): void {
    while (!this.queue.isEmpty() && this.openDispatches.length > 0 && this.tokens >= 1) {
      const dispatchLocation = this.openDispatches.pop();
      if (dispatchLocation !== undefined) {
        const dispatch = this.queue.dequeue();

        dispatch.metadata.lastRunTime = null;
        dispatch.metadata.currentAttempt = 1;
        dispatch.metadata.currentBackoff = this.config.retryConfig.minBackoffSeconds;
        dispatch.metadata.status = TaskStatus.NOT_STARTED;
        dispatch.metadata.startTime = Date.now();

        this.dispatches[dispatchLocation] = dispatch;
        this.tokens--;
      }
    }
  }

  // Used for testing
  setDispatch(dispatches: (EmulatedTask | null)[]): void {
    this.dispatches = dispatches;
    const open = [];
    for (let i = 0; i < this.dispatches.length; i++) {
      if (dispatches[i] === null) {
        open.push(i);
      }
    }
    this.openDispatches = open;
  }

  getDispatch(): (EmulatedTask | null)[] {
    return this.dispatches;
  }

  // Updates the status of all tasks that are currently in the task dispatch
  processDispatch(): void {
    for (let i = 0; i < this.dispatches.length; i++) {
      if (this.dispatches[i] !== null) {
        switch (this.dispatches[i]?.metadata.status) {
          case TaskStatus.FAILED:
            this.dispatches[i] = null;
            this.openDispatches.push(i);
            break;
          case TaskStatus.NOT_STARTED:
            void this.runTask(i);
            break;
          case TaskStatus.RETRY:
            this.handleRetry(i);
            break;
          case TaskStatus.FINISHED:
            this.dispatches[i] = null;
            this.openDispatches.push(i);
            break;
        }
      }
    }
  }

  async runTask(dispatchIndex: number): Promise<void> {
    if (this.dispatches[dispatchIndex] === null) {
      throw new Error("Trying to dispatch a nonexistent task");
    }

    const emulatedTask = this.dispatches[dispatchIndex] as EmulatedTask;

    if (
      emulatedTask.metadata.lastRunTime !== null &&
      Date.now() - emulatedTask.metadata.lastRunTime < emulatedTask.metadata.currentBackoff * 1000
    ) {
      // Task is not yet ready to run
      return;
    }

    emulatedTask.metadata.status = TaskStatus.RUNNING;
    try {
      const response = await fetch(emulatedTask.task.httpRequest.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...emulatedTask.task.httpRequest.headers,
        },
        body: JSON.stringify(emulatedTask.task.httpRequest.body),
      });

      if (response.ok) {
        emulatedTask.metadata.status = TaskStatus.FINISHED;
        return;
      } else {
        emulatedTask.metadata.status = TaskStatus.RETRY;
        emulatedTask.metadata.lastRunTime = Date.now();
      }
    } catch (e) {
      console.error(e);
    }
  }

  handleRetry(dispatchIndex: number): void {
    if (this.dispatches[dispatchIndex] === null) {
      throw new Error("Trying to retry a nonexistent task");
    }
    const { metadata } = this.dispatches[dispatchIndex] as EmulatedTask;
    const { retryConfig } = this.config;

    // Determine if the task has failed
    if (this.shouldStopRetrying(metadata, retryConfig)) {
      metadata.status = TaskStatus.FAILED;
      return;
    }

    // Compute Retry Parameters
    this.updateMetadata(metadata, retryConfig);
    metadata.status = TaskStatus.NOT_STARTED;
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

  isActive(): boolean {
    return !this.queue.isEmpty() || this.dispatches.some((e) => e !== null);
  }

  refillTokens(): void {
    const tokensToAdd =
      ((Date.now() - this.lastTokenUpdate) / 1000) * this.config.rateLimits.maxDispatchesPerSecond;
    this.addTokens(tokensToAdd);
    this.lastTokenUpdate = Date.now();
  }

  addTokens(t: number): void {
    this.tokens += t;
    this.tokens = Math.min(this.tokens, this.maxTokens);
  }

  setTokens(t: number): void {
    this.tokens = t;
  }

  getTokens(): number {
    return this.tokens;
  }

  enqueue(task: Task): void {
    const emulatedTask: EmulatedTask = {
      task: task,
      metadata: {
        currentAttempt: 0,
        currentBackoff: 0,
        startTime: 0,
        status: TaskStatus.NOT_STARTED,
        lastRunTime: null,
      },
    };

    emulatedTask.task.httpRequest.url = 
      emulatedTask.task.httpRequest.url === '' 
      ? this.config.defaultUri 
      : emulatedTask.task.httpRequest.url;

    this.queue.enqueue(emulatedTask.task.name, emulatedTask);
  }

  delete(taskId: string): void {
    this.queue.remove(taskId);
  }

  getDebugInfo(): string {
    return `
    Task Queue (${this.key}): 
    - Active: ${this.isActive().toString()}
    - Tokens: ${this.tokens}
    - In Queue: ${this.queue.size()}
    - Dispatch: [
      ${this.dispatches.map((t) => (t === null ? "empty" : t.task.name)).join(",\n")}
    ]
    - Open Locations: [${this.openDispatches.join(", ")}]
    `;
  }
}
