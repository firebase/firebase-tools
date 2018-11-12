import * as logger from "./logger";

function _backoff(retryNumber: number, delay: number): Promise<void> {
  return new Promise((resolve: () => void) => {
    setTimeout(resolve, delay * Math.pow(2, retryNumber));
  });
}

function DEFAULT_HANDLER(task: any): Promise<any> {
  return (task as () => Promise<any>)();
}

export interface QueueOptions<T> {
  name?: string;
  concurrency?: number;
  handler?: (task: T) => Promise<any>;
  retries?: number;
  backoff?: number;
}

export interface QueueStats {
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

export class Queue<T> {
  public name: string = "queue";
  public concurrency: number = 200;
  public handler: (task: T) => Promise<any> = DEFAULT_HANDLER;
  public cursor: number = 0;
  public active: number = 0;
  public complete: number = 0;
  public success: number = 0;
  public errored: number = 0;
  public retried: number = 0;
  public total: number = 0;
  public tasks: { [index: number]: T } = {};
  public waits: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  public min: number = 9999999999;
  public max: number = 0;
  public avg: number = 0;
  public retries: number = 0;
  public backoff: number = 200;
  public retryCounts: { [index: number]: number } = {};
  public closed: boolean = false;
  public finished: boolean = false;
  public startTime: number = 0;

  constructor(options: QueueOptions<T>) {
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

  public wait(): Promise<void> {
    const p = new Promise<void>((resolve, reject) => {
      this.waits.push({ resolve, reject });
    });
    return p;
  }

  public add(task: T): void {
    if (this.closed) {
      throw new Error("Cannot add a task to a closed queue.");
    }

    if (!this.startTime) {
      this.startTime = Date.now();
    }

    this.tasks[this.total] = task;
    this.total++;
    this.process();
  }

  public close(): boolean {
    this.closed = true;
    return this._finishIfIdle();
  }

  public process(): void {
    if (this._finishIfIdle() || this.active >= this.concurrency || this.cursor === this.total) {
      return;
    }

    this.cursor++;
    this.active++;
    this.handle(this.cursor - 1);
  }

  public async handle(cursorIndex: number): Promise<void> {
    const task = this.tasks[cursorIndex];
    const tname = this.taskName(cursorIndex);
    const t0 = Date.now();

    try {
      await this.handler(task);
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
      delete this.tasks[cursorIndex];
      delete this.retryCounts[cursorIndex];
      this.process();
    } catch (err) {
      if (this.retries > 0) {
        this.retryCounts[cursorIndex] = this.retryCounts[cursorIndex] || 0;
        if (this.retryCounts[cursorIndex] < this.retries) {
          this.retryCounts[cursorIndex]++;
          this.retried++;
          await _backoff(this.retryCounts[cursorIndex], this.backoff);
          logger.debug(`[${this.name}] Retrying task`, tname);
          return this.handle(cursorIndex);
        }
      }

      this.errored++;
      this.complete++;
      this.active--;
      if (this.retryCounts[cursorIndex] > 0) {
        logger.debug(`[${this.name}] Retries exhausted for task ${tname}:`, err);
      } else {
        logger.debug(`[${this.name}] Error on task ${tname}:`, err);
      }
      this._finish(err);
    }
  }

  public stats(): QueueStats {
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

  public taskName(cursorIndex: number): string {
    const task = this.tasks[cursorIndex] || "finished task";
    return typeof task === "string" ? task : `index ${cursorIndex}`;
  }

  private _finishIfIdle(): boolean {
    if (this.closed && this.cursor === this.total && this.active === 0) {
      this._finish(null);
      return true;
    }

    return false;
  }

  private _finish(err: Error | null): void {
    this.waits.forEach((p) => {
      if (err) {
        return p.reject(err);
      }
      this.finished = true;
      return p.resolve();
    });
  }
}

export default Queue;
