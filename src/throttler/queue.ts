import { Throttler, ThrottlerOptions } from "./throttler";

export class Queue<T, R> extends Throttler<T, R> {
  cursor: number = 0;

  constructor(options: ThrottlerOptions<T, R>) {
    super(options);
    this.name = this.name || "queue";
  }

  hasWaitingTask(): boolean {
    return this.cursor !== this.total;
  }

  nextWaitingTaskIndex(): number {
    if (this.cursor >= this.total) {
      throw new Error("There is no more task in queue");
    }
    this.cursor++;
    return this.cursor - 1;
  }
}

export default Queue;
