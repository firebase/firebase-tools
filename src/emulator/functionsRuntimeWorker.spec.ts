import * as httpMocks from "node-mocks-http";
import * as sinon from "sinon";
import * as http from "http";
import { PassThrough } from "stream";
import { expect } from "chai";
import { FunctionsRuntimeInstance, IPCConn } from "./functionsEmulator";
import { EventEmitter } from "events";
import { RuntimeWorker, RuntimeWorkerPool, RuntimeWorkerState } from "./functionsRuntimeWorker";
import { EmulatedTriggerDefinition } from "./functionsEmulatorShared";
import { EmulatorLog, FunctionsExecutionMode } from "./types";
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
  conn = new IPCConn("/path/to/socket/foo.sock");

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
    CREATED: 0,
    IDLE: 0,
    BUSY: 0,
    FINISHING: 0,
    FINISHED: 0,
  };

  constructor(worker: RuntimeWorker) {
    this.increment(worker.state);
    worker.stateEvents.on(RuntimeWorkerState.CREATED, () => {
      this.increment(RuntimeWorkerState.CREATED);
    });
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
    return (
      this.counts.CREATED +
      this.counts.IDLE +
      this.counts.BUSY +
      this.counts.FINISHING +
      this.counts.FINISHED
    );
  }
}

function mockTrigger(id: string): EmulatedTriggerDefinition {
  return {
    id,
    name: id,
    entryPoint: id,
    region: "us-central1",
    platform: "gcfv2",
  };
}

describe("FunctionsRuntimeWorker", () => {
  let requestStub: sinon.SinonStub;

  beforeEach(() => {
    requestStub = sinon.stub(http, "request");
  });

  afterEach(() => {
    requestStub.restore();
  });

  function mockSuccessfulRequest(statusCode = 200, body = "") {
    requestStub.callsFake((options: any, callback: any) => {
      const mockRes = new PassThrough();
      (mockRes as any).statusCode = statusCode;
      (mockRes as any).headers = {};

      const mockReq = new PassThrough();
      if (callback) {
        process.nextTick(() => {
          callback(mockRes);
          mockRes.push(body);
          mockRes.push(null);
        });
      }
      return mockReq as any;
    });
  }

  function mockFailedRequest(err: Error) {
    requestStub.callsFake(() => {
      const mockReq = new PassThrough();
      process.nextTick(() => {
        mockReq.emit("error", err);
      });
      return mockReq as any;
    });
  }

  describe("RuntimeWorker", () => {
    it("goes from created --> idle --> busy --> idle in normal operation", async () => {
      mockSuccessfulRequest(200);

      const worker = new RuntimeWorker("trigger", new MockRuntimeInstance(), {});
      const counter = new WorkerStateCounter(worker);

      worker.readyForWork();
      await worker.request(
        { method: "GET", path: "/" },
        httpMocks.createResponse({ eventEmitter: EventEmitter }),
      );

      expect(counter.counts.CREATED).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.IDLE).to.eql(2);
      expect(counter.total).to.eql(4);
    });

    it("goes from created --> idle --> busy --> finished when there's an error", async () => {
      mockFailedRequest(new Error("boom"));

      const worker = new RuntimeWorker("trigger", new MockRuntimeInstance(), {});
      const counter = new WorkerStateCounter(worker);

      worker.readyForWork();
      await worker.request(
        { method: "GET", path: "/" },
        httpMocks.createResponse({ eventEmitter: EventEmitter }),
      );

      expect(counter.counts.CREATED).to.eql(1);
      expect(counter.counts.IDLE).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.FINISHED).to.eql(1);
      expect(counter.total).to.eql(4);
    });

    it("goes from created --> busy --> finishing --> finished when marked", async () => {
      mockFailedRequest(new Error("boom"));

      const worker = new RuntimeWorker("trigger", new MockRuntimeInstance(), {});
      const counter = new WorkerStateCounter(worker);

      worker.readyForWork();
      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        worker.state = RuntimeWorkerState.FINISHING;
      });
      await worker.request({ method: "GET", path: "/" }, resp);

      expect(counter.counts.CREATED).to.eql(1);
      expect(counter.counts.IDLE).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.FINISHING).to.eql(1);
      expect(counter.counts.FINISHED).to.eql(1);
      expect(counter.total).to.eql(5);
    });

    it("buffers stdout and stderr independently", () => {
      const runtime = new MockRuntimeInstance();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      runtime.process.stdout = stdout as any;
      runtime.process.stderr = stderr as any;

      const worker = new RuntimeWorker("trigger", runtime, {});
      const logs: EmulatorLog[] = [];
      worker.onLogs((log) => {
        logs.push(log);
      });

      stdout.write("stdout-1 ");
      stderr.write("stderr-line\n");
      stdout.write("stdout-2\n");

      expect(logs.map((l) => l.text)).to.deep.eq(["stderr-line", "stdout-1 stdout-2"]);
    });

    it("decodes multi-byte UTF-8 split across chunks without replacement characters", () => {
      const runtime = new MockRuntimeInstance();
      const stdout = new PassThrough();
      runtime.process.stdout = stdout as any;

      const worker = new RuntimeWorker("trigger", runtime, {});
      const logs: EmulatorLog[] = [];
      worker.onLogs((log) => {
        logs.push(log);
      });

      // "日" in UTF-8 is [0xe6, 0x97, 0xa5]
      // Split the bytes across two buffer chunks
      const chunk1 = Buffer.from([0xe6]);
      const chunk2 = Buffer.from([0x97, 0xa5, 0x0a]); // followed by \n

      stdout.write(chunk1);
      stdout.write(chunk2);

      expect(logs.length).to.eq(1);
      expect(logs[0].text).to.eq("日");
      expect(logs[0].text).not.to.include("\uFFFD");
    });

    it("flushes remaining buffer on stream end and process exit", async () => {
      const runtime = new MockRuntimeInstance();
      const stdout = new PassThrough();
      runtime.process.stdout = stdout as any;

      const worker = new RuntimeWorker("trigger", runtime, {});
      const logs: EmulatorLog[] = [];
      worker.onLogs((log) => {
        logs.push(log);
      });

      await new Promise<void>((resolve) => {
        stdout.on("end", () => resolve());
        stdout.write("unterminated line");
        stdout.end();
      });

      expect(logs.length).to.eq(1);
      expect(logs[0].text).to.eq("unterminated line");
    });
  });

  describe("RuntimeWorkerPool", () => {
    it("properly manages a single worker", async () => {
      mockSuccessfulRequest(200);

      const pool = new RuntimeWorkerPool();
      const triggerId = "region-trigger1";

      // No idle workers to begin
      expect(pool.getIdleWorker(triggerId)).to.be.undefined;

      // Add a worker and make sure it's there
      const worker = pool.addWorker(mockTrigger(triggerId), new MockRuntimeInstance(), {});
      worker.readyForWork();
      const triggerWorkers = pool.getTriggerWorkers(triggerId);
      expect(triggerWorkers.length).length.to.eq(1);
      expect(pool.getIdleWorker(triggerId)).to.eql(worker);

      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        // Finished sending response. About to go back to IDLE state.
        expect(pool.getIdleWorker(triggerId)).to.be.undefined;
      });
      await worker.request({ method: "GET", path: "/" }, resp);

      // Completed handling request. Worker should be IDLE again.
      expect(pool.getIdleWorker(triggerId)).to.eql(worker);
    });

    it("does not consider failed workers idle", async () => {
      const pool = new RuntimeWorkerPool();
      const triggerId = "trigger1";

      // No idle workers to begin
      expect(pool.getIdleWorker(triggerId)).to.be.undefined;

      // Add a worker to the pool that's destined to fail.
      mockFailedRequest(new Error("boom"));
      const worker = pool.addWorker(mockTrigger(triggerId), new MockRuntimeInstance(), {});
      worker.readyForWork();
      expect(pool.getIdleWorker(triggerId)).to.eql(worker);

      // Send request to the worker. Request should fail, killing the worker.
      await worker.request(
        { method: "GET", path: "/" },
        httpMocks.createResponse({ eventEmitter: EventEmitter }),
      );

      // Confirm there are no idle workers.
      expect(pool.getIdleWorker(triggerId)).to.be.undefined;
    });

    it("exit() kills idle and busy workers", async () => {
      const pool = new RuntimeWorkerPool();
      const triggerId = "trigger1";

      const busyWorker = pool.addWorker(mockTrigger(triggerId), new MockRuntimeInstance(), {});
      busyWorker.readyForWork();
      const busyWorkerCounter = new WorkerStateCounter(busyWorker);

      const idleWorker = pool.addWorker(mockTrigger(triggerId), new MockRuntimeInstance(), {});
      idleWorker.readyForWork();
      const idleWorkerCounter = new WorkerStateCounter(idleWorker);

      // Add a worker to the pool that's destined to fail.
      mockSuccessfulRequest(200);
      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        pool.exit();
      });
      await busyWorker.request({ method: "GET", path: "/" }, resp);

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
      const triggerId = "trigger1";

      const busyWorker = pool.addWorker(mockTrigger(triggerId), new MockRuntimeInstance(), {});
      busyWorker.readyForWork();
      const busyWorkerCounter = new WorkerStateCounter(busyWorker);

      const idleWorker = pool.addWorker(mockTrigger(triggerId), new MockRuntimeInstance(), {});
      idleWorker.readyForWork();
      const idleWorkerCounter = new WorkerStateCounter(idleWorker);

      // Add a worker to the pool that's destined to fail.
      mockSuccessfulRequest(200);
      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        pool.refresh();
      });
      await busyWorker.request({ method: "GET", path: "/" }, resp);

      expect(busyWorkerCounter.counts.BUSY).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHING).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHED).to.eql(1);

      expect(idleWorkerCounter.counts.IDLE).to.eql(1);
      expect(idleWorkerCounter.counts.FINISHING).to.eql(1);
      expect(idleWorkerCounter.counts.FINISHED).to.eql(1);
    });

    it("gives assigns all triggers to the same worker in sequential mode", async () => {
      mockSuccessfulRequest(200);

      const triggerId1 = "region-abc";
      const triggerId2 = "region-def";

      const pool = new RuntimeWorkerPool(FunctionsExecutionMode.SEQUENTIAL);
      const worker = pool.addWorker(mockTrigger(triggerId1), new MockRuntimeInstance(), {});
      worker.readyForWork();

      const resp = httpMocks.createResponse({ eventEmitter: EventEmitter });
      resp.on("end", () => {
        expect(pool.readyForWork(triggerId1)).to.be.false;
        expect(pool.readyForWork(triggerId2)).to.be.false;
      });
      await worker.request({ method: "GET", path: "/" }, resp);

      expect(pool.readyForWork(triggerId1)).to.be.true;
      expect(pool.readyForWork(triggerId2)).to.be.true;
    });
  });
});
