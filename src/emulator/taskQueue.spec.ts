import * as _ from "lodash";
import * as sinon from "sinon";
import * as nodeFetch from "node-fetch";
import { expect } from "chai";
import { EmulatedTask, EmulatedTaskMetadata, Queue, TaskQueue, TaskStatus } from "./taskQueue";
import { RateLimits, RetryConfig, Task, TaskQueueConfig } from "./tasksEmulator";

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

  it("should error if at capacity", () => {
    const taskQueue = new Queue<number>(1);
    taskQueue.enqueue("1", 1);
    expect(() => taskQueue.enqueue("2", 2)).to.throw("Queue has reached capacity");
  });

  it("should return all items", () => {
    const taskQueue = new Queue<number>();
    taskQueue.enqueue("1", 1);
    taskQueue.enqueue("2", 2);
    expect(taskQueue.getAll()).to.deep.eq([1, 2]);
  });
});

describe("Task Queue", () => {
  const TEST_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 10,
    maxRetrySeconds: 30,
    maxBackoffSeconds: 40,
    maxDoublings: 2,
    minBackoffSeconds: 2,
  };

  const TEST_RATE_LIMITS: RateLimits = {
    maxConcurrentDispatches: 1,
    maxDispatchesPerSecond: 2,
  };

  const TEST_TASK_QUEUE_CONFIG: TaskQueueConfig = {
    retryConfig: TEST_RETRY_CONFIG,
    rateLimits: TEST_RATE_LIMITS,
    timeoutSeconds: 0,
    retry: false,
    defaultUri: "http://website.com/",
  };

  const TEST_TASK_QUEUE_NAME = "task-queue";

  const mockTask: Task = {
    name: "",
    httpRequest: {
      url: "",
      oidcToken: { serviceAccountEmail: "test-user@email.com" },
      body: { test: "test" },
      headers: {},
    },
  };

  const mockMetadata: EmulatedTaskMetadata = {
    currentAttempt: 1,
    currentBackoff: 0,
    startTime: 0,
    status: TaskStatus.NOT_STARTED,
    lastRunTime: null,
    executionCount: 0,
    previousResponse: null,
  };

  const mockEmulatedTask: EmulatedTask = {
    task: mockTask,
    metadata: mockMetadata,
  };

  let TEST_TASK: EmulatedTask;
  const NOW = 1000 * 60;

  const stubs: sinon.SinonStub[] = [];

  before(() => {
    sinon.stub(Date, "now").returns(NOW);
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    TEST_TASK = _.cloneDeep(mockEmulatedTask);
    TEST_TASK.metadata.currentBackoff = 0;
  });

  afterEach(() => {
    stubs.forEach((s) => s.restore());
  });

  // Handle Retry Tests
  describe("Retry", () => {
    it("should update retried task status to not started", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.status).to.be.eq(TaskStatus.NOT_STARTED);
    });

    it("should update retried task status to failed when max attempts are reached", () => {
      const config = _.cloneDeep(TEST_TASK_QUEUE_CONFIG);
      config.retryConfig.maxRetrySeconds = null;

      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, config);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      TEST_TASK.metadata.currentAttempt = 11;
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.status).to.be.eq(TaskStatus.FAILED);
    });

    it("should update retried task status to failed when max attempts and max time are reached", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      TEST_TASK.metadata.currentAttempt = 11;
      TEST_TASK.metadata.startTime = NOW - (1000 * 30 + 1);
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.status).to.be.eq(TaskStatus.FAILED);
    });

    it("should double retry time", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentBackoff).to.be.eq(2);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentBackoff).to.be.eq(4);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentBackoff).to.be.eq(8);
    });

    it("should increment the attempt number", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentAttempt).to.be.eq(2);
    });

    it("shouldn't exceed the max backoff seconds", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      TEST_TASK.metadata.currentAttempt = 9;
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentBackoff).to.be.eq(40);
    });

    it("should increase by a constant when doublings have maxxed", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      TEST_TASK.metadata.status = TaskStatus.RETRY;
      TEST_TASK.metadata.currentAttempt = 5;
      // 1 -> 2
      // 2 -> 4
      // 3 -> 8
      // 4 -> 16
      // 5 -> 24
      taskQueue.setDispatch([TEST_TASK]);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentBackoff).to.be.eq(24);
      taskQueue.handleRetry(0);
      expect(TEST_TASK.metadata.currentBackoff).to.be.eq(32);
    });

    it("should throw if task doesn't exist", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      taskQueue.setDispatch([TEST_TASK, null]);
      expect(() => taskQueue.handleRetry(1)).to.throw("Trying to retry a nonexistent task");
    });
  });

  describe("Run Task", () => {
    it("should call the task url", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const response = new nodeFetch.Response(undefined, { status: 200 });
      const fetchStub = sinon.stub(nodeFetch, "default").resolves(response);
      stubs.push(fetchStub);
      taskQueue.setDispatch([TEST_TASK]);
      const res = taskQueue.runTask(0).then(() => {
        expect(fetchStub).to.have.been.calledOnce.and.calledWith(TEST_TASK.task.httpRequest.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CloudTasks-QueueName": "task-queue",
            "X-CloudTasks-TaskName": "",
            "X-CloudTasks-TaskRetryCount": "0",
            "X-CloudTasks-TaskExecutionCount": "0",
            "X-CloudTasks-TaskETA": "60000",
            ...TEST_TASK.task.httpRequest.headers,
          },
          signal: new AbortController().signal,
          body: JSON.stringify(TEST_TASK.task.httpRequest.body),
        });
      });
      return res;
    });

    it("Should wait until the backoff time has elapsed", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const response = new nodeFetch.Response(undefined, { status: 200 });

      TEST_TASK.metadata.lastRunTime = NOW - 1000;
      TEST_TASK.metadata.currentBackoff = 3;

      const fetchStub = sinon.stub(nodeFetch, "default").resolves(response);
      stubs.push(fetchStub);
      taskQueue.setDispatch([TEST_TASK]);

      const res = taskQueue.runTask(0).then(() => {
        expect(fetchStub).to.not.have.been.called;
      });
      return res;
    });

    it("Should run if the backoff time has elapsed", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const response = new nodeFetch.Response(undefined, { status: 200 });
      TEST_TASK.metadata.lastRunTime = NOW - 3 * 1000;
      TEST_TASK.metadata.currentBackoff = 2;

      const fetchStub = sinon.stub(nodeFetch, "default").resolves(response);
      stubs.push(fetchStub);
      taskQueue.setDispatch([TEST_TASK]);
      const res = taskQueue.runTask(0).then(() => {
        expect(fetchStub).to.have.been.calledOnce.and.calledWith(TEST_TASK.task.httpRequest.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CloudTasks-QueueName": "task-queue",
            "X-CloudTasks-TaskName": "",
            "X-CloudTasks-TaskRetryCount": "0",
            "X-CloudTasks-TaskExecutionCount": "0",
            "X-CloudTasks-TaskETA": "60000",
            ...TEST_TASK.task.httpRequest.headers,
          },
          signal: new AbortController().signal,
          body: JSON.stringify(TEST_TASK.task.httpRequest.body),
        });
      });
      return res;
    });

    it("should properly update metadata on success", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const response = new nodeFetch.Response(undefined, { status: 200 });

      const fetchStub = sinon.stub(nodeFetch, "default").resolves(response);
      stubs.push(fetchStub);
      taskQueue.setDispatch([TEST_TASK]);
      const res = taskQueue.runTask(0).then(() => {
        expect(TEST_TASK.metadata.status).to.be.eq(TaskStatus.FINISHED);
      });
      return res;
    });

    it("should properly update metadata on failure", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const response = new nodeFetch.Response(undefined, { status: 500 });

      const fetchStub = sinon.stub(nodeFetch, "default").resolves(response);
      stubs.push(fetchStub);
      taskQueue.setDispatch([TEST_TASK]);
      const res = taskQueue.runTask(0).then(() => {
        expect(TEST_TASK.metadata.status).to.be.eq(TaskStatus.RETRY);
        expect(TEST_TASK.metadata.lastRunTime).to.be.eq(NOW);
      });
      return res;
    });

    it("should throw if task doesn't exist", async () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      taskQueue.setDispatch([TEST_TASK, null]);
      await expect(taskQueue.runTask(1)).to.be.rejectedWith(
        "Trying to dispatch a nonexistent task",
      );
    });
  });

  describe("enqueue", () => {
    it("should set the proper task uri", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const task = _.cloneDeep(TEST_TASK.task);
      taskQueue.enqueue(task);
      expect(task.httpRequest.url).to.be.eq(TEST_TASK_QUEUE_CONFIG.defaultUri);
    });
  });

  describe("Dispatch Tasks", () => {
    it("should move the first task in the queue to the dispatch", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const task = _.cloneDeep(TEST_TASK.task);
      taskQueue.enqueue(task);
      taskQueue.setTokens(1);
      taskQueue.dispatchTasks();
      expect(taskQueue.getDispatch()[0]!.task).to.deep.eq(task);
    });

    it("should not dispatch tasks if the queue has no tokens", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const task = _.cloneDeep(TEST_TASK.task);
      taskQueue.enqueue(task);
      taskQueue.setTokens(0);
      taskQueue.dispatchTasks();
      expect(taskQueue.getDispatch()[0]).to.be.eq(null);
    });

    it("should not dispatch tasks if the dispatch is full", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const task1 = _.cloneDeep(TEST_TASK.task);
      const task2 = _.cloneDeep(TEST_TASK.task);
      task1.name = "task1";
      task2.name = "task2";
      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);
      taskQueue.setTokens(1);
      taskQueue.dispatchTasks();
      expect(taskQueue.getDispatch().map((et) => et?.task)).to.deep.eq([task1]);
    });

    it("should fill up empty dispatch slots", () => {
      const taskQueue = new TaskQueue(TEST_TASK_QUEUE_NAME, TEST_TASK_QUEUE_CONFIG);
      const task1 = _.cloneDeep(TEST_TASK.task);
      task1.name = "task1";
      taskQueue.enqueue(task1);
      taskQueue.setDispatch([TEST_TASK, null, TEST_TASK]);
      taskQueue.setTokens(1);
      taskQueue.dispatchTasks();
      expect(taskQueue.getDispatch().map((et) => et?.task)).to.deep.eq([
        TEST_TASK.task,
        task1,
        TEST_TASK.task,
      ]);
    });
  });
});
