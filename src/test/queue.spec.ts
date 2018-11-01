import * as sinon from "sinon";
import * as chai from "chai";

chai.use(require("chai-as-promised"));
const { expect } = chai;

const Queue = require("../queue");

const TEST_ERROR = new Error("foobar");

describe("Queue", () => {
  it("should ignore non-number backoff", () => {
    const q = new Queue({
      backoff: "not a number"
    });
    expect(q.backoff).to.equal(200);
  });

  it("should handle function tasks", () => {
    const task = sinon.stub().resolves();
    const q = new Queue({});

    q.add(task);
    q.close();

    return q.wait()
        .then(() => {
          expect(task.callCount).to.equal(1);
          expect(q.complete).to.equal(1);
          expect(q.success).to.equal(1);
          expect(q.errored).to.equal(0);
          expect(q.retried).to.equal(0);
        });
  });

  it("should handle tasks", () => {
    const handler = sinon.stub().resolves();
    const q = new Queue({
      handler,
    });

    q.add(4);
    q.close();

    return q.wait()
      .then(() => {
        expect(handler.callCount).to.equal(1);
        expect(q.complete).to.equal(1);
        expect(q.success).to.equal(1);
        expect(q.errored).to.equal(0);
        expect(q.retried).to.equal(0);
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

    return q.wait()
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

    return q.wait()
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
      });
  });

  it("should retry the number of retries for both tasks", () => {
    const stub = sinon.stub()
        .onCall(2).resolves(0)
        .onCall(5).resolves(0)
        .rejects(TEST_ERROR);
    const handler = stub;

    const q = new Queue({
      backoff: 0,
      handler,
      retries: 3,
    });

    q.add(5);
    q.add(5);
    q.close();

    return q
      .wait()
      .catch((err: Error) => {
        throw new Error("handler should have passed");
      })
      .then(() => {
        expect(handler.callCount).to.equal(6);
        expect(q.complete).to.equal(2);
        expect(q.success).to.equal(2);
        expect(q.errored).to.equal(0);
        expect(q.retried).to.equal(4);
      })
  });
});
