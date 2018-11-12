import * as chai from "chai";
import * as sinon from "sinon";

const { expect } = chai;

import Queue from "../queue";

const TEST_ERROR = new Error("foobar");

describe("Queue", () => {
  it("should return the task as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new Queue({
      handler,
    });

    const stringTask = "test task";
    q.add(stringTask);

    expect(q.taskName(0)).to.equal(stringTask);
  });

  it("should return the index as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new Queue({
      handler,
    });

    q.add(2);

    expect(q.taskName(0)).to.equal("index 0");
  });

  it("should return 'finished task' as the task name", () => {
    const handler = sinon.stub().resolves();
    const q = new Queue({
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
    const q = new Queue({});

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
    const q = new Queue({
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
    const q = new Queue({
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
    const q = new Queue({
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

    const q = new Queue({
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

    const q = new Queue({
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
});
