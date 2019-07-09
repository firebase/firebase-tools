import { Throttler, ThrottlerOptions } from "./throttler";

export class Stack<T, R> extends Throttler<T, R> {
  lastTotal: number = 0;
  stack: number[] = [];

  constructor(options: ThrottlerOptions<T, R>) {
    super(options);
    this.name = this.name || "stack";
  }

  hasWaitingTask(): boolean {
    return this.lastTotal !== this.total || this.stack.length > 0;
  }

  nextWaitingTaskIndex(): number {
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
