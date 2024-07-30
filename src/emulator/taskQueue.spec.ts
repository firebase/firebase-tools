import { expect } from "chai";
import { Queue } from "./taskQueue";

describe("Queue Test", () => {
  it("should create an empty task queue", () => {
    const taskQueue = new Queue<number>();
    expect(taskQueue).to.not.be.null;
  });

  it("should enqueue an element to a task queue", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.enqueue("2", 2);
  });

  it("should dequeue an element to a task queue", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.enqueue("2", 2);
    const first = taskQueue.dequeue();
    const second = taskQueue.dequeue();
    expect(first).to.eq(1);
    expect(second).to.eq(2);
  });

  it("should handle enqueueing and dequeueing elements from  a task queue", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.enqueue("2", 2);
    const first = taskQueue.dequeue();
    taskQueue.enqueue("3", 3);
    const second = taskQueue.dequeue();
    const third = taskQueue.dequeue();
    expect(first).to.eq(1);
    expect(second).to.eq(2);
    expect(third).to.eq(3);
  });

  it("should properly remove items from a queue", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.enqueue("2", 2);
    taskQueue.enqueue("3", 3);
    taskQueue.enqueue("4", 4);
    taskQueue.enqueue("5", 5);
    taskQueue.remove("1");
    taskQueue.remove("3");
    taskQueue.remove("5");
    const first = taskQueue.dequeue();
    const second = taskQueue.dequeue();

    expect(first).to.eq(2);
    expect(second).to.eq(4);

    expect(() => taskQueue.dequeue()).to.throw("Trying to dequeue from an empty queue");
  });

  it("should error when trying to peek or remove from an empty task queue", () => {
    const taskQueue = new Queue<number>();
    expect(() => taskQueue.peek()).to.throw("Trying to peek into an empty queue");
    expect(() => taskQueue.dequeue()).to.throw("Trying to dequeue from an empty queue");
  });

  it("should error when trying to remove a task that doesn't exist in the queue", () => {
    const taskQueue = new Queue<number>();
    expect(() => taskQueue.peek()).to.throw("Trying to peek into an empty queue");
    expect(() => taskQueue.dequeue()).to.throw("Trying to dequeue from an empty queue");
  });

  it("should be able to peek into a queue", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    expect(taskQueue.peek()).to.eq(1);
    expect(taskQueue.peek()).to.eq(1);
  });

  it("should only allow unique IDs", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    expect(() => taskQueue.enqueue("1", 1)).to.throw("Queue IDs must be unique");
  });

  it("should error when trying to remove a non-existent item", () => {
    const taskQueue = new Queue<number>();
    expect(() => taskQueue.remove("1")).to.throw("Trying to remove a task that doesn't exist");
  });

  it("should be able to remove an item when it is the only thing in the queue", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.remove("1");
    taskQueue.enqueue("1", 1);
    expect(taskQueue.dequeue()).to.eq(1);
  });

  it("should properly determine if the queue is empty", () => {
    const taskQueue = new Queue<number>();
    expect(taskQueue.isEmpty()).to.eq(true);
    taskQueue.enqueue("1", 1);
    expect(taskQueue.isEmpty()).to.eq(false);
    taskQueue.dequeue();
    expect(taskQueue.isEmpty()).to.eq(true);
  });

  it("should report the correct size", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.remove("1");
    taskQueue.enqueue("1", 1);
    expect(taskQueue.size()).to.eq(1);
  });
});
