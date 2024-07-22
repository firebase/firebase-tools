class Node<T> {
  public data: T;
  public next: Node<T> | null;
  public prev: Node<T> | null;

  constructor(data: T) {
    this.data = data;
    this.next = null;
    this.prev = null;
  }
}

// A FIFO queue that supports enqueueing, dequeueing, and deleting elements in O(1) time.
export class Queue<T> {
  private first: Node<T> | null;
  private last: Node<T> | null;
  private nodeMap: Record<string, Node<T>> = {};

  constructor() {
    this.first = null;
    this.last = null;
  }
  enqueue(id: string, item: T): void {
    const newNode = new Node(item);
    if (this.nodeMap[id] !== undefined) {
      throw new Error("Queue IDs must be unique");
    }
    this.nodeMap[id] = newNode;
    if (!this.first) {
      this.first = newNode;
    }
    if (this.last) {
      this.last.next = newNode;
    }
    newNode.prev = this.last;
    this.last = newNode;
  }

  peek(): T {
    if (this.first) {
      return this.first.data;
    } else {
      throw new Error("Trying to peek into an empty queue");
    }
  }

  dequeue(): T {
    if (this.first) {
      const currentFirst = this.first;
      this.first = this.first.next;
      if (this.last === currentFirst) {
        this.last = null;
      }
      return currentFirst.data;
    } else {
      throw new Error("Trying to dequeue from an empty queue");
    }
  }

  remove(id: string): void {
    if (this.nodeMap[id] === undefined) {
      throw new Error("Trying to remove a task that doesn't exist");
    }
    const toRemove = this.nodeMap[id];
    // Case that the item being removed is the only item in the queue;
    if (toRemove.next === null && toRemove.prev === null) {
      this.first = null;
      this.last = null;
    }
    // Case that the item is the last in the queue
    else if (toRemove.next === null) {
      this.last = toRemove.prev;
      toRemove.prev!.next = null;
    }
    // Case that the item is the first in the queue
    else if (toRemove.prev === null) {
      this.first = toRemove.next;
      toRemove.next.prev = null;
    }
    // Regular case
    else {
      const prev = toRemove.prev;
      const next = toRemove.next;
      prev.next = next;
      next.prev = prev;
    }
    delete this.nodeMap[id];
  }

  isEmpty(): boolean {
    return this.first === null;
  }
}
