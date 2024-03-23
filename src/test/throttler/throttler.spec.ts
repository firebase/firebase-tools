import * as sinon from "sinon";
import { expect } from "chai";

import Queue from "../../throttler/queue";
import Stack from "../../throttler/stack";
import { Throttler, ThrottlerOptions, timeToWait } from "../../throttler/throttler";
import TaskError from "../../throttler/errors/task-error";
import TimeoutError from "../../throttler/errors/timeout-error";
import RetriesExhaustedError from "../../throttler/errors/retries-exhausted-error";

const TEST_ERROR = new Error("foobar");

type ThrottlerConstructorType = new <T, R>(options: ThrottlerOptions<T, R>) => Throttler<T, R>;

const throttlerTest = (ThrottlerConstructor: ThrottlerConstructorType): void => {
  it("should have no waiting task after creation", () => {
    const queue = new ThrottlerConstructor({});
    expect(queue.hasWaitingTask()).to.equal(false);
  });

  it("should return the task as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new ThrottlerConstructor({
      handler,
    });

    const stringTask = "test task";
    q.add(stringTask);

    expect(q.taskName(0)).to.equal(stringTask);
  });

  it("should return the index as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new ThrottlerConstructor({
      handler,
    });

    q.add(2);

    expect(q.taskName(0)).to.equal("index 0");
  });

  it("should return 'finished task' as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new ThrottlerConstructor({
      handler,
    });

    q.add(2);
    q.close();

    return q.wait().then(() => {
      expect(q.taskName(0)).to.equal("finished task");
    });
  });

  it("should handle function tasks", () => {
    const task = sinon.stub().resolves();
    const q = new ThrottlerConstructor({});

    q.add(task);
    q.close();

    return q.wait().then(() => {
      expect(task.callCount).to.equal(1);
      expect(q.complete).to.equal(1);
      expect(q.success).to.equal(1);
      expect(q.errored).to.equal(0);
      expect(q.retried).to.equal(0);
      expect(q.total).to.equal(1);
    });
  });

  it("should handle tasks", () => {
    const handler = sinon.stub().resolves();
    const q = new ThrottlerConstructor({
      handler,
    });

    q.add(4);
    q.close();

    return q.wait().then(() => {
      expect(handler.callCount).to.equal(1);
      expect(q.complete).to.equal(1);
      expect(q.success).to.equal(1);
      expect(q.errored).to.equal(0);
      expect(q.retried).to.equal(0);
      expect(q.total).to.equal(1);
    });
  });

  it("should not retry", () => {
    const handler = sinon.stub().rejects(TEST_ERROR);
    const q = new ThrottlerConstructor({
      handler,
      retries: 0,
    });

    q.add(4);
    q.close();

    return q
      .wait()
      .then(() => {
        throw new Error("handler should have rejected");
      })
      .catch((err: TaskError) => {
        expect(err).to.be.an.instanceof(RetriesExhaustedError);
        expect(err.original).to.equal(TEST_ERROR);
        expect(err.message).to.equal(
          "Task index 0 failed: retries exhausted after 1 attempts, with error: foobar",
        );
      })
      .then(() => {
        expect(handler.callCount).to.equal(1);
        expect(q.complete).to.equal(1);
        expect(q.success).to.equal(0);
        expect(q.errored).to.equal(1);
        expect(q.retried).to.equal(0);
        expect(q.total).to.equal(1);
      });
  });

  it("should retry the number of retries, plus one", () => {
    const handler = sinon.stub().rejects(TEST_ERROR);
    const q = new ThrottlerConstructor({
      backoff: 0,
      handler,
      retries: 3,
    });

    q.add(4);
    q.close();

    return q
      .wait()
      .then(() => {
        throw new Error("handler should have rejected");
      })
      .catch((err: TaskError) => {
        expect(err).to.be.an.instanceof(RetriesExhaustedError);
        expect(err.original).to.equal(TEST_ERROR);
        expect(err.message).to.equal(
          "Task index 0 failed: retries exhausted after 4 attempts, with error: foobar",
        );
      })
      .then(() => {
        expect(handler.callCount).to.equal(4);
        expect(q.complete).to.equal(1);
        expect(q.success).to.equal(0);
        expect(q.errored).to.equal(1);
        expect(q.retried).to.equal(3);
        expect(q.total).to.equal(1);
      });
  });

  it("should handle tasks in concurrency", () => {
    const callCountMap = new Map<any, number>();
    const handler = (task: any) => {
      let count = callCountMap.get(task);
      if (!count) {
        count = 0;
      }
      count += 1;
      callCountMap.set(task, count);
      if (count > 2) {
        return Promise.resolve();
      }
      return Promise.reject();
    };

    const q = new ThrottlerConstructor({
      backoff: 0,
      concurrency: 2,
      handler,
      retries: 2,
    });

    q.add("1");
    q.add("2");
    q.add("3");
    q.close();

    return q
      .wait()
      .catch((err: Error) => {
        throw new Error(`handler should have passed ${err.message}`);
      })
      .then(() => {
        expect(q.complete).to.equal(3);
        expect(q.success).to.equal(3);
        expect(q.errored).to.equal(0);
        expect(q.retried).to.equal(6);
        expect(q.total).to.equal(3);
      });
  });

  it("should retry the number of retries for mutiple identical tasks", () => {
    const handler = sinon
      .stub()
      .rejects(TEST_ERROR)
      .onCall(2)
      .resolves(0)
      .onCall(5)
      .resolves(0)
      .onCall(8)
      .resolves(0);

    const q = new ThrottlerConstructor({
      backoff: 0,
      concurrency: 1, // this makes sure only one task is running at a time, so not flaky
      handler,
      retries: 2,
    });

    q.add(5);
    q.add(5);
    q.add(5);
    q.close();

    return q
      .wait()
      .catch((err: Error) => {
        throw new Error(`handler should have passed ${err.message}`);
      })
      .then(() => {
        expect(handler.callCount).to.equal(9);
        expect(q.complete).to.equal(3);
        expect(q.success).to.equal(3);
        expect(q.errored).to.equal(0);
        expect(q.retried).to.equal(6);
        expect(q.total).to.equal(3);
      });
  });

  it("should return the result of task", () => {
    const handler = (task: number) => {
      return Promise.resolve(`result: ${task}`);
    };

    const q = new ThrottlerConstructor({
      handler,
    });

    expect(q.run(2)).to.eventually.to.equal("result: 2");
    expect(q.run(3)).to.eventually.to.equal("result: 3");
  });

  it("should resolve if task finishes before timeout", async () => {
    const handler = (task: number) => {
      return Promise.resolve(`result: ${task}`);
    };

    const q = new Queue({
      handler,
    });

    expect(await q.run(2, 20000000)).to.equal("result: 2");
    expect(q.complete).to.equal(1);
    expect(q.success).to.equal(1);
    expect(q.errored).to.equal(0);
    expect(q.retried).to.equal(0);
    expect(q.total).to.equal(1);
  });

  it("should reject if timeout", async () => {
    const handler = (task: number) =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(`result: ${task}`);
        }, 150);
      });

    const q = new Queue({
      handler,
    });

    let err;
    try {
      await q.run(2, 100);
    } catch (e: any) {
      err = e;
    }
    expect(err).to.be.instanceOf(TimeoutError);
    expect(err.message).to.equal("Task index 0 failed: timed out after 100ms.");
  });

  it("should reject with RetriesExhaustedError if last trial is rejected before timeout", async () => {
    const handler = sinon.stub().rejects(TEST_ERROR);

    const q = new Queue({
      handler,
      retries: 2,
      backoff: 10,
    });

    let err;
    try {
      await q.run(2, 200);
    } catch (e: any) {
      err = e;
    }
    expect(err).to.be.instanceOf(RetriesExhaustedError);
    expect(err.original).to.equal(TEST_ERROR);
    expect(err.message).to.equal(
      "Task index 0 failed: retries exhausted after 3 attempts, with error: foobar",
    );
    expect(handler.callCount).to.equal(3);
    expect(q.complete).to.equal(1);
    expect(q.success).to.equal(0);
    expect(q.errored).to.equal(1);
    expect(q.retried).to.equal(2);
    expect(q.total).to.equal(1);
  });

  it("should reject with TimeoutError if timeout while retrying", async () => {
    const handler = sinon.stub().rejects(TEST_ERROR);

    const q = new Queue({
      handler,
      retries: 1000,
      backoff: 5,
    });

    let err;
    try {
      await q.run(2, 100);
    } catch (e: any) {
      err = e;
    }
    expect(err).to.be.instanceOf(TimeoutError);
    expect(handler.callCount).to.be.at.least(2);
    expect(err.message).to.equal("Task index 0 failed: timed out after 100ms.");
    expect(q.complete).to.equal(1);
    expect(q.success).to.equal(0);
    expect(q.errored).to.equal(1);
    expect(q.retried).to.be.at.least(3);
    expect(q.total).to.equal(1);
  });

  it("should reject with TimeoutError when waiting", async () => {
    const handler = sinon.stub().rejects(TEST_ERROR).onFirstCall().resolves(0);

    const q = new Queue({
      handler,
      retries: 4,
      backoff: 20,
    });

    q.add(2);
    q.add(3, 10); // This fails first due to very short timeout
    q.add(4, 500);
    q.close();

    let err;
    try {
      await q.wait();
    } catch (e: any) {
      err = e;
    }
    expect(err).to.be.instanceOf(TimeoutError);
    expect(err.message).to.equal("Task index 1 failed: timed out after 10ms.");
    expect(handler.callCount).to.equal(3);
    expect(q.complete).to.equal(2);
    expect(q.success).to.equal(1);
    expect(q.errored).to.equal(1);
    expect(q.total).to.equal(3);
  });

  it("should reject with RetriesExhaustedError when waiting", async () => {
    const handler = sinon.stub().rejects(TEST_ERROR).onFirstCall().resolves(0);

    const q = new Queue({
      handler,
      retries: 1,
      backoff: 10,
    });

    q.add(2);
    q.add(3, 100); // This fails due to retries exhausted since we only retry once
    q.close();

    let err;
    try {
      await q.wait();
    } catch (e: any) {
      err = e;
    }
    expect(err).to.be.instanceOf(RetriesExhaustedError);
    expect(err.message).to.equal(
      "Task index 1 failed: retries exhausted after 2 attempts, with error: foobar",
    );
    expect(handler.callCount).to.equal(3);
    expect(q.complete).to.equal(2);
    expect(q.success).to.equal(1);
    expect(q.errored).to.equal(1);
    expect(q.retried).to.equal(1);
    expect(q.total).to.equal(2);
  });
};

describe("Throttler", () => {
  describe("Queue", () => {
    throttlerTest(Queue);
  });
  describe("Stack", () => {
    throttlerTest(Stack);
  });
});

describe("timeToWait", () => {
  it("should wait the base delay on the first attempt", () => {
    const retryCount = 0;
    const delay = 100;
    const maxDelay = 1000;
    expect(timeToWait(retryCount, delay, maxDelay)).to.equal(delay);
  });

  it("should back off exponentially", () => {
    const delay = 100;
    const maxDelay = 1000;
    expect(timeToWait(1, delay, maxDelay)).to.equal(delay * 2);
    expect(timeToWait(2, delay, maxDelay)).to.equal(delay * 4);
    expect(timeToWait(3, delay, maxDelay)).to.equal(delay * 8);
  });

  it("should not wait longer than maxDelay", () => {
    const retryCount = 2;
    const delay = 300;
    const maxDelay = 400;
    expect(timeToWait(retryCount, delay, maxDelay)).to.equal(maxDelay);
  });
});

/**
 * Some shared test utility for Queue and Stack.
 */
export interface Task {
  /**
   * The identifier added to the ordering list.
   */
  name: string;

  /**
   * Gets returned by the handler.
   * We can control the timing of this promise in test.
   */
  promise: Promise<any>;

  /**
   * Mark the task as done.
   */
  resolve: (value?: any) => void;

  /**
   * Mark the task as failed.
   */
  reject: (reason?: any) => void;

  /**
   * Mark the task as started.
   */
  startExecute: (value?: any) => void;

  /**
   * A promise that wait until this task starts executing.
   */
  startExecutePromise: Promise<any>;
}

export const createTask = (name: string, resolved: boolean) => {
  return new Promise<Task>((res) => {
    let resolve: (value?: any) => void = () => {
      throw new Error("resolve is not set");
    };
    let reject: (reason?: any) => void = () => {
      throw new Error("reject is not set");
    };
    let startExecute: (value?: any) => void = () => {
      throw new Error("startExecute is not set");
    };
    const promise = new Promise((s, j) => {
      resolve = s;
      reject = j;
    });
    const startExecutePromise = new Promise((s) => {
      startExecute = s;
    });
    res({
      name,
      promise,
      resolve,
      reject,
      startExecute,
      startExecutePromise,
    });
    if (resolved) {
      resolve();
    }
  });
};

export const createHandler = (orderList: string[]) => {
  return (task: Task) => {
    task.startExecute();
    return task.promise.then(() => {
      orderList.push(task.name);
    });
  };
};
