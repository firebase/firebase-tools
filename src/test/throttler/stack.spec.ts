import * as chai from "chai";
import Stack from "../../throttler/stack";

const { expect } = chai;

describe("Stack", () => {
  it("should have default name of stack", () => {
    const stack = new Stack({});
    expect(stack.name).to.equal("stack");
  });

  it("should be first-in-last-out", () => {
    const stack = new Stack({});
    expect(stack.hasWaitingTask()).to.equal(false);

    stack.total++;
    expect(stack.hasWaitingTask()).to.equal(true);

    stack.total++;
    expect(stack.hasWaitingTask()).to.equal(true);

    expect(stack.nextWaitingTaskIndex()).to.equal(1);
    expect(stack.hasWaitingTask()).to.equal(true);

    expect(stack.nextWaitingTaskIndex()).to.equal(0);
    expect(stack.hasWaitingTask()).to.equal(false);
  });

  it("should not repeat completed tasks", () => {
    const stack = new Stack({});
    expect(stack.hasWaitingTask()).to.equal(false);

    stack.total += 3;
    expect(stack.nextWaitingTaskIndex()).to.equal(2);

    stack.total += 2;
    expect(stack.nextWaitingTaskIndex()).to.equal(4);
    expect(stack.nextWaitingTaskIndex()).to.equal(3);
    expect(stack.nextWaitingTaskIndex()).to.equal(1);

    stack.total += 2;
    expect(stack.nextWaitingTaskIndex()).to.equal(6);
    expect(stack.nextWaitingTaskIndex()).to.equal(5);
    expect(stack.nextWaitingTaskIndex()).to.equal(0);
    expect(stack.hasWaitingTask()).to.equal(false);
  });
});
