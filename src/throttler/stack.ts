import { Throttler, ThrottlerOptions } from "./throttler";

export class Stack<T> extends Throttler<T> {
  public lastTotal: number = 0;
  public stack: number[] = [];

  constructor(options: ThrottlerOptions<T>) {
    super(options);
    this.name = this.name || "stack";
  }

  public hasWaitingTask(): boolean {
    return this.lastTotal !== this.total || this.stack.length > 0;
  }

  public nextWaitingTaskIndex(): number {
    while (this.lastTotal < this.total) {
      this.stack.push(this.lastTotal);
      this.lastTotal++;
    }
    const next = this.stack.pop();
    if (next === undefined) {
      throw new Error("There is no more task in stack");
    }
    return next;
  }
}

export default Stack;
