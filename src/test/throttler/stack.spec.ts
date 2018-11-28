import * as chai from "chai";
const { expect } = chai;

import Stack from "../../throttler/stack";
import { createTask, Task } from "./throttler.spec";

describe("Stack", () => {
  it("should have default name of stack", () => {
    const stack = new Stack({});
    expect(stack.name).to.equal("stack");
  });

  it("should be first-in-last-out", async () => {
    const order: string[] = [];
    const queue = new Stack<Task>({
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
    expect(order).to.deep.equal(["blocker", "2", "1"]);
  });

  it("should not repeat completed tasks", async () => {
    const order: string[] = [];
    const queue = new Stack<Task>({
      handler: (task: Task) => {
        task.startExecute();
        return task.promise.then(() => {
          order.push(task.name);
        });
      },
      concurrency: 1,
    });

    const t1 = await createTask("t1", false);
    queue.add(t1);
    const t2 = await createTask("t2", false);
    queue.add(t2);

    queue.add(await createTask("added before t1 finished 1", true));
    queue.add(await createTask("added before t1 finished 2", true));
    t1.resolve();

    await t2.startExecutePromise; // wait until t2 starts to execute

    queue.add(await createTask("added before t2 finished 1", true));
    queue.add(await createTask("added before t2 finished 2", true));
    t2.resolve();

    queue.close();
    await queue.wait();
    expect(order).to.deep.equal([
      "t1",
      "added before t1 finished 2",
      "added before t1 finished 1",
      "t2",
      "added before t2 finished 2",
      "added before t2 finished 1",
    ]);
  });
});
