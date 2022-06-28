/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
