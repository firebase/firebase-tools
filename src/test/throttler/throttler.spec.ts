import * as sinon from "sinon";
import { expect } from "chai";

import Queue from "../../throttler/queue";
import Stack from "../../throttler/stack";
import { Throttler, ThrottlerOptions } from "../../throttler/throttler";

const TEST_ERROR = new Error("foobar");

interface ThrottlerConstructor {
  new <T, R>(options: ThrottlerOptions<T, R>): Throttler<T, R>;
}

const throttlerTest = (throttlerConstructor: ThrottlerConstructor) => {
  it("should have no waiting task after creation", () => {
    const queue = new throttlerConstructor({});
    expect(queue.hasWaitingTask()).to.equal(false);
  });

  it("should return the task as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new throttlerConstructor({
      handler,
    });

    const stringTask = "test task";
    q.add(stringTask);

    expect(q.taskName(0)).to.equal(stringTask);
  });

  it("should return the index as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new throttlerConstructor({
      handler,
    });

    q.add(2);

    expect(q.taskName(0)).to.equal("index 0");
  });

  it("should return 'finished task' as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new throttlerConstructor({
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
    const q = new throttlerConstructor({});

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
    const q = new throttlerConstructor({
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
    const q = new throttlerConstructor({
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
      .catch((err: Error) => {
        expect(err).to.equal(TEST_ERROR);
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
    const q = new throttlerConstructor({
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
      .catch((err: Error) => {
        expect(err).to.equal(TEST_ERROR);
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

    const q = new throttlerConstructor({
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
        throw new Error("handler should have passed ");
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

    const q = new throttlerConstructor({
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
        throw new Error("handler should have passed");
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

    const q = new throttlerConstructor({
      handler,
    });

    expect(q.run(2)).to.eventually.to.equal("result: 2");
    expect(q.run(3)).to.eventually.to.equal("result: 3");
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
    const startExecutePromise = new Promise((s, j) => {
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
