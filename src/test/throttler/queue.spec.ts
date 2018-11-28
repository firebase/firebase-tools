import * as chai from "chai";
const { expect } = chai;

import Queue from "../../throttler/queue";
import { createTask, Task } from "./throttler.spec";

describe("Queue", () => {
  it("should have default name of queue", () => {
    const queue = new Queue({});
    expect(queue.name).to.equal("queue");
  });

  it("should be first-in-first-out", async () => {
    const order: string[] = [];
    const queue = new Queue<Task>({
      handler: (task: Task) => {
        return task.promise.then(() => {
          order.push(task.name);
        });
      },
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
