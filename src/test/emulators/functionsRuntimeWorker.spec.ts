import * as httpMocks from "node-mocks-http";
import * as nock from "nock";
import { expect } from "chai";
import { FunctionsRuntimeInstance } from "../../emulator/functionsEmulator";
import { EventEmitter } from "events";
import {
  RuntimeWorker,
  RuntimeWorkerPool,
  RuntimeWorkerState,
} from "../../emulator/functionsRuntimeWorker";
import { EmulatorLog, FunctionsExecutionMode } from "../../emulator/types";
import { ChildProcess } from "child_process";

/**
 * Fake runtime instance we can use to simulate different subprocess conditions.
 * It automatically fails or succeeds 10ms after being given work to do.
 */
class MockRuntimeInstance implements FunctionsRuntimeInstance {
  process: ChildProcess;
  metadata: { [key: string]: any } = {};
  events: EventEmitter = new EventEmitter();
  exit: Promise<number>;
  cwd = "/home/users/dir";
  socketPath = "/path/to/socket/foo.sock";

  constructor() {
    this.exit = new Promise((resolve) => {
      this.events.on("exit", resolve);
    });
    this.process = new EventEmitter() as ChildProcess;
    this.process.kill = () => {
      this.events.emit("log", new EmulatorLog("SYSTEM", "runtime-status", "killed"));
      this.process.emit("exit");
      return true;
    };
  }
}

/**
 * Test helper to count worker state transitions.
 */
class WorkerStateCounter {
  counts: { [state in RuntimeWorkerState]: number } = {
    IDLE: 0,
    BUSY: 0,
    FINISHING: 0,
    FINISHED: 0,
  };

  constructor(worker: RuntimeWorker) {
    this.increment(worker.state);
    worker.stateEvents.on(RuntimeWorkerState.IDLE, () => {
      this.increment(RuntimeWorkerState.IDLE);
    });
    worker.stateEvents.on(RuntimeWorkerState.BUSY, () => {
      this.increment(RuntimeWorkerState.BUSY);
    });
    worker.stateEvents.on(RuntimeWorkerState.FINISHING, () => {
      this.increment(RuntimeWorkerState.FINISHING);
    });
    worker.stateEvents.on(RuntimeWorkerState.FINISHED, () => {
      this.increment(RuntimeWorkerState.FINISHED);
    });
  }

  private increment(state: RuntimeWorkerState) {
    this.counts[state]++;
  }

  get total() {
    return this.counts.IDLE + this.counts.BUSY + this.counts.FINISHING + this.counts.FINISHED;
  }
}

describe("FunctionsRuntimeWorker", () => {
  const workerPool = new RuntimeWorkerPool();

  describe("RuntimeWorker", () => {
    it("goes from idle --> busy --> idle in normal operation", async () => {
      const scope = nock("http://localhost").get("/").reply(200);

      const worker = new RuntimeWorker(workerPool.getKey("trigger"), new MockRuntimeInstance());
      const counter = new WorkerStateCounter(worker);

      await worker.request(
        { method: "GET", path: "/" },
        httpMocks.createResponse({ eventEmitter: EventEmitter })
      );
      scope.done();

      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.IDLE).to.eql(2);
      expect(counter.total).to.eql(3);
    });

    it("goes from idle --> busy --> finished when there's an error", async () => {
      const scope = nock("http://localhost").get("/").replyWithError("boom");

      const worker = new RuntimeWorker(workerPool.getKey("trigger"), new MockRuntimeInstance());
      const counter = new WorkerStateCounter(worker);

      await worker.request(
        { method: "GET", path: "/" },
        httpMocks.createResponse({ eventEmitter: EventEmitter })
      );
      scope.done();

      expect(counter.counts.IDLE).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.FINISHED).to.eql(1);
      expect(counter.total).to.eql(3);
    });

    it("goes from busy --> finishing --> finished when marked", async () => {
      const scope = nock("http://localhost").get("/").replyWithError("boom");

      const worker = new RuntimeWorker(workerPool.getKey("trigger"), new MockRuntimeInstance());
      const counter = new WorkerStateCounter(worker);

      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        worker.state = RuntimeWorkerState.FINISHING;
      });
      await worker.request({ method: "GET", path: "/" }, resp);
      scope.done();

      expect(counter.counts.IDLE).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.FINISHING).to.eql(1);
      expect(counter.counts.FINISHED).to.eql(1);
      expect(counter.total).to.eql(4);
    });
  });

  describe("RuntimeWorkerPool", () => {
    it("properly manages a single worker", async () => {
      const scope = nock("http://localhost").get("/").reply(200);

      const pool = new RuntimeWorkerPool();
      const trigger = "region-trigger1";

      // No idle workers to begin
      expect(pool.getIdleWorker(trigger)).to.be.undefined;

      // Add a worker and make sure it's there
      const worker = pool.addWorker(trigger, new MockRuntimeInstance());
      const triggerWorkers = pool.getTriggerWorkers(trigger);
      expect(triggerWorkers.length).length.to.eq(1);
      expect(pool.getIdleWorker(trigger)).to.eql(worker);

      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        // Finished sending response. About to go back to IDLE state.
        expect(pool.getIdleWorker(trigger)).to.be.undefined;
      });
      await worker.request({ method: "GET", path: "/" }, resp);
      scope.done();

      // Completed handling request. Worker should be IDLE again.
      expect(pool.getIdleWorker(trigger)).to.eql(worker);
    });

    it("does not consider failed workers idle", async () => {
      const pool = new RuntimeWorkerPool();
      const trigger = "trigger1";

      // No idle workers to begin
      expect(pool.getIdleWorker(trigger)).to.be.undefined;

      // Add a worker to the pool that's destined to fail.
      const scope = nock("http://localhost").get("/").replyWithError("boom");
      const worker = pool.addWorker(trigger, new MockRuntimeInstance());
      expect(pool.getIdleWorker(trigger)).to.eql(worker);

      // Send request to the worker. Request should fail, killing the worker.
      await worker.request(
        { method: "GET", path: "/" },
        httpMocks.createResponse({ eventEmitter: EventEmitter })
      );
      scope.done();

      // Confirm there are no idle workers.
      expect(pool.getIdleWorker(trigger)).to.be.undefined;
    });

    it("exit() kills idle and busy workers", async () => {
      const pool = new RuntimeWorkerPool();
      const trigger = "trigger1";

      const busyWorker = pool.addWorker(trigger, new MockRuntimeInstance());
      const busyWorkerCounter = new WorkerStateCounter(busyWorker);

      const idleWorker = pool.addWorker(trigger, new MockRuntimeInstance());
      const idleWorkerCounter = new WorkerStateCounter(idleWorker);

      // Add a worker to the pool that's destined to fail.
      const scope = nock("http://localhost").get("/").reply(200);
      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        pool.exit();
      });
      await busyWorker.request({ method: "GET", path: "/" }, resp);
      scope.done();

      expect(busyWorkerCounter.counts.IDLE).to.eql(1);
      expect(busyWorkerCounter.counts.BUSY).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHED).to.eql(1);
      expect(busyWorkerCounter.total).to.eql(3);

      expect(idleWorkerCounter.counts.IDLE).to.eql(1);
      expect(idleWorkerCounter.counts.FINISHED).to.eql(1);
      expect(idleWorkerCounter.total).to.eql(2);
    });

    it("refresh() kills idle workers and marks busy ones as finishing", async () => {
      const pool = new RuntimeWorkerPool();
      const trigger = "trigger1";

      const busyWorker = pool.addWorker(trigger, new MockRuntimeInstance());
      const busyWorkerCounter = new WorkerStateCounter(busyWorker);

      const idleWorker = pool.addWorker(trigger, new MockRuntimeInstance());
      const idleWorkerCounter = new WorkerStateCounter(idleWorker);

      // Add a worker to the pool that's destined to fail.
      const scope = nock("http://localhost").get("/").reply(200);
      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        pool.refresh();
      });
      await busyWorker.request({ method: "GET", path: "/" }, resp);
      scope.done();

      expect(busyWorkerCounter.counts.BUSY).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHING).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHED).to.eql(1);

      expect(idleWorkerCounter.counts.IDLE).to.eql(1);
      expect(idleWorkerCounter.counts.FINISHING).to.eql(1);
      expect(idleWorkerCounter.counts.FINISHED).to.eql(1);
    });

    it("gives assigns all triggers to the same worker in sequential mode", async () => {
      const scope = nock("http://localhost").get("/").reply(200);

      const trigger1 = "region-abc";
      const trigger2 = "region-def";

      const pool = new RuntimeWorkerPool(FunctionsExecutionMode.SEQUENTIAL);
      const worker = pool.addWorker(trigger1, new MockRuntimeInstance());

      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        expect(pool.readyForWork(trigger1)).to.be.false;
        expect(pool.readyForWork(trigger2)).to.be.false;
      });
      await worker.request({ method: "GET", path: "/" }, resp);
      scope.done();

      expect(pool.readyForWork(trigger1)).to.be.true;
      expect(pool.readyForWork(trigger2)).to.be.true;
    });
  });
});
