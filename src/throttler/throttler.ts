import * as logger from "../logger";

function backoff(retryNumber: number, delay: number): Promise<void> {
  return new Promise((resolve: () => void) => {
    setTimeout(resolve, delay * Math.pow(2, retryNumber));
  });
}

function DEFAULT_HANDLER<R>(task: any): Promise<R> {
  return (task as () => Promise<R>)();
}

export interface ThrottlerOptions<T, R> {
  name?: string;
  concurrency?: number;
  handler?: (task: T) => Promise<R>;
  retries?: number;
  backoff?: number;
}

export interface ThrottlerStats {
  max: number;
  min: number;
  avg: number;
  active: number;
  complete: number;
  success: number;
  errored: number;
  retried: number;
  total: number;
  elapsed: number;
}

interface TaskData<T, R> {
  task: T;
  retryCount: number;
  wait?: { resolve: (R: any) => void; reject: (err: Error) => void };
}

export abstract class Throttler<T, R> {
  name: string = "";
  concurrency: number = 200;
  handler: (task: T) => Promise<any> = DEFAULT_HANDLER;
  active: number = 0;
  complete: number = 0;
  success: number = 0;
  errored: number = 0;
  retried: number = 0;
  total: number = 0;
  taskDataMap = new Map<number, TaskData<T, R>>();
  waits: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  min: number = 9999999999;
  max: number = 0;
  avg: number = 0;
  retries: number = 0;
  backoff: number = 200;
  closed: boolean = false;
  finished: boolean = false;
  startTime: number = 0;

  constructor(options: ThrottlerOptions<T, R>) {
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
    if (typeof options.backoff === "number") {
      this.backoff = options.backoff;
    }
  }

  /**
   * @return `true` if there are unscheduled task waiting to be scheduled.
   */
  abstract hasWaitingTask(): boolean;

  /**
   * @return the index of the next task to schedule.
   */
  abstract nextWaitingTaskIndex(): number;

  wait(): Promise<void> {
    const p = new Promise<void>((resolve, reject) => {
      this.waits.push({ resolve, reject });
    });
    return p;
  }

  /**
   * Add the task to the throttler.
   * When the task is completed, resolve will be called with handler's result.
   * If this task fails after retries, reject will be called with the error.
   */
  add(task: T): void {
    this.addHelper(task);
  }

  /**
   * Add the task to the throttler and return a promise of handler's result.
   * If the task failed, both the promised returned by throttle and wait will reject.
   */
  run(task: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.addHelper(task, { resolve, reject });
    });
  }

  close(): boolean {
    this.closed = true;
    return this.finishIfIdle();
  }

  process(): void {
    if (this.finishIfIdle() || this.active >= this.concurrency || !this.hasWaitingTask()) {
      return;
    }

    this.active++;
    this.handle(this.nextWaitingTaskIndex());
  }

  async handle(cursorIndex: number): Promise<void> {
    const taskData = this.taskDataMap.get(cursorIndex);
    if (!taskData) {
      throw new Error(`taskData.get(${cursorIndex}) does not exist`);
    }
    const task = taskData.task;
    const tname = this.taskName(cursorIndex);
    const t0 = Date.now();

    try {
      const result = await this.handler(task);
      const dt = Date.now() - t0;
      if (dt < this.min) {
        this.min = dt;
      }
      if (dt > this.max) {
        this.max = dt;
      }
      this.avg = (this.avg * this.complete + dt) / (this.complete + 1);

      this.success++;
      this.complete++;
      this.active--;
      if (taskData.wait) {
        taskData.wait.resolve(result);
      }
      this.taskDataMap.delete(cursorIndex);
      this.process();
    } catch (err) {
      if (this.retries > 0) {
        if (taskData.retryCount < this.retries) {
          taskData.retryCount++;
          this.retried++;
          await backoff(taskData.retryCount, this.backoff);
          logger.debug(`[${this.name}] Retrying task`, tname);
          return this.handle(cursorIndex);
        }
      }

      this.errored++;
      this.complete++;
      this.active--;
      if (taskData.retryCount > 0) {
        logger.debug(`[${this.name}] Retries exhausted for task ${tname}:`, err);
      } else {
        logger.debug(`[${this.name}] Error on task ${tname}:`, err);
      }
      if (taskData.wait) {
        taskData.wait.reject(err);
      }
      this.finish(err);
    }
  }

  stats(): ThrottlerStats {
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

  taskName(cursorIndex: number): string {
    const taskData = this.taskDataMap.get(cursorIndex);
    if (!taskData) {
      return "finished task";
    }
    return typeof taskData.task === "string" ? taskData.task : `index ${cursorIndex}`;
  }

  private addHelper(
    task: T,
    wait?: { resolve: (result: R) => void; reject: (err: Error) => void }
  ): void {
    if (this.closed) {
      throw new Error("Cannot add a task to a closed throttler.");
    }
    if (!this.startTime) {
      this.startTime = Date.now();
    }
    this.taskDataMap.set(this.total, {
      task,
      wait,
      retryCount: 0,
    });
    this.total++;
    this.process();
  }

  private finishIfIdle(): boolean {
    if (this.closed && !this.hasWaitingTask() && this.active === 0) {
      this.finish(null);
      return true;
    }

    return false;
  }

  private finish(err: Error | null): void {
    this.waits.forEach((p) => {
      if (err) {
        return p.reject(err);
      }
      this.finished = true;
      return p.resolve();
    });
  }
}
