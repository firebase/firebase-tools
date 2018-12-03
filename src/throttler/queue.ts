import { Throttler, ThrottlerOptions } from "./throttler";

export class Queue<T> extends Throttler<T> {
  public cursor: number = 0;

  constructor(options: ThrottlerOptions<T>) {
    super(options);
    this.name = this.name || "queue";
  }

  public hasWaitingTask(): boolean {
    return this.cursor !== this.total;
  }

  public nextWaitingTaskIndex(): number {
    if (this.cursor >= this.total) {
      throw new Error("There is no more task in queue");
    }
    this.cursor++;
    return this.cursor - 1;
  }
}

export default Queue;
