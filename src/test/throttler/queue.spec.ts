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

import { expect } from "chai";

import Queue from "../../throttler/queue";
import { createHandler, createTask, Task } from "./throttler.spec";

describe("Queue", () => {
  it("should have default name of queue", () => {
    const queue = new Queue({});
    expect(queue.name).to.equal("queue");
  });

  it("should be first-in-first-out", async () => {
    const order: string[] = [];
    const queue = new Queue<Task, void>({
      handler: createHandler(order),
      concurrency: 1,
    });

    const blocker = await createTask("blocker", false);
    queue.add(blocker);
    queue.add(await createTask("1", true));
    queue.add(await createTask("2", true));

    blocker.resolve();

    queue.close();
    await queue.wait();
    expect(order).to.deep.equal(["blocker", "1", "2"]);
  });
});
