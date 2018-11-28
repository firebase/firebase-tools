import * as chai from "chai";

const { expect } = chai;

import Queue from "../../throttler/queue";

describe("Queue", () => {
  it("should have default name of queue", () => {
    const queue = new Queue({});
    expect(queue.name).to.equal("queue");
  });

  it("should be first-in-first-out", () => {
    const queue = new Queue({});
    expect(queue.hasWaitingTask()).to.equal(false);

    queue.total++;
    expect(queue.hasWaitingTask()).to.equal(true);

    queue.total++;
    expect(queue.hasWaitingTask()).to.equal(true);

    expect(queue.nextWaitingTaskIndex()).to.equal(0);
    expect(queue.hasWaitingTask()).to.equal(true);

    expect(queue.nextWaitingTaskIndex()).to.equal(1);
    expect(queue.hasWaitingTask()).to.equal(false);
  });
});
