import { expect } from "chai";
import { FunctionsRuntimeInstance } from "../../emulator/functionsEmulator";
import { EventEmitter } from "events";
import {
  FunctionsRuntimeArgs,
  FunctionsRuntimeBundle,
  EmulatedTriggerType,
} from "../../emulator/functionsEmulatorShared";
import {
  RuntimeWorker,
  RuntimeWorkerState,
  RuntimeWorkerPool,
} from "../../emulator/functionsRuntimeWorker";

/**
 * Fake runtime instance we can use to simulate different subprocess conditions.
 * It automatically fails or succeeds 10ms after being given work to do.
 */
class MockRuntimeInstance implements FunctionsRuntimeInstance {
  metadata: { [key: string]: any } = {};
  events: EventEmitter = new EventEmitter();
  exit: Promise<number>;

  constructor(private success: boolean) {
    this.exit = new Promise((res) => {
      this.events.on("exit", res);
    });
  }

  shutdown(): void {
    this.events.emit("exit", { reason: "shutdown" });
  }

  kill(signal?: string): void {
    this.events.emit("exit", { reason: "kill" });
  }

  send(args: FunctionsRuntimeArgs): boolean {
    setTimeout(() => {
      if (this.success) {
        this.logRuntimeStatus({ state: "idle" });
      } else {
        this.kill();
      }
    }, 10);
    return true;
  }

  logRuntimeStatus(data: any) {
    this.events.emit("log", { type: "runtime-status", data });
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

class MockRuntimeBundle implements FunctionsRuntimeBundle {
  projectId = "project-1234";
  triggerType = EmulatedTriggerType.HTTPS;
  cwd = "/home/users/dir";
  ports = {};

  constructor(public triggerId: string) {}
}

describe("FunctionsRuntimeWorker", () => {
  describe("RuntimeWorker", () => {
    it("goes from idle --> busy --> idle in normal operation", async () => {
      const worker = new RuntimeWorker("trigger", new MockRuntimeInstance(true));
      const counter = new WorkerStateCounter(worker);

      worker.execute(new MockRuntimeBundle("trigger"));
      await worker.waitForDone();

      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.IDLE).to.eql(2);
      expect(counter.total).to.eql(3);
    });

    it("goes from idle --> busy --> finished when there's an error", async () => {
      const worker = new RuntimeWorker("trigger", new MockRuntimeInstance(false));
      const counter = new WorkerStateCounter(worker);

      worker.execute(new MockRuntimeBundle("trigger"));
      await worker.waitForDone();

      expect(counter.counts.IDLE).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.FINISHED).to.eql(1);
      expect(counter.total).to.eql(3);
    });

    it("goes from busy --> finishing --> finished when marked", async () => {
      const worker = new RuntimeWorker("trigger", new MockRuntimeInstance(true));
      const counter = new WorkerStateCounter(worker);

      worker.execute(new MockRuntimeBundle("trigger"));
      worker.state = RuntimeWorkerState.FINISHING;
      await worker.waitForDone();

      expect(counter.counts.IDLE).to.eql(1);
      expect(counter.counts.BUSY).to.eql(1);
      expect(counter.counts.FINISHING).to.eql(1);
      expect(counter.counts.FINISHED).to.eql(1);
      expect(counter.total).to.eql(4);
    });
  });

  describe("RuntimeWorkerPool", () => {
    it("properly manages a single worker", async () => {
      const pool = new RuntimeWorkerPool();
      const trigger = "trigger1";

      // No idle workers to begin
      expect(pool.getIdleWorker(trigger)).to.be.undefined;

      // Add a worker and make sure it's there
      const worker = pool.addWorker(trigger, new MockRuntimeInstance(true));
      const triggerWorkers = pool.workers.get(trigger);
      expect(triggerWorkers!.length).length.to.eq(1);
      expect(pool.getIdleWorker(trigger)).to.eql(worker);

      // Make the worker busy, confirm nothing is idle
      worker.execute(new MockRuntimeBundle(trigger));
      expect(pool.getIdleWorker(trigger)).to.be.undefined;

      // When the worker is finished work, confirm it's idle again
      await worker.waitForDone();
      expect(pool.getIdleWorker(trigger)).to.eql(worker);
    });

    it("does not consider failed workers idle", async () => {
      const pool = new RuntimeWorkerPool();
      const trigger = "trigger1";

      // No idle workers to begin
      expect(pool.getIdleWorker(trigger)).to.be.undefined;

      // Add a worker to the pool that will fail, confirm it begins idle
      const worker = pool.addWorker(trigger, new MockRuntimeInstance(false));
      expect(pool.getIdleWorker(trigger)).to.eql(worker);

      // Make the worker execute (and fail)
      worker.execute(new MockRuntimeBundle(trigger));
      await worker.waitForDone();

      // Confirm there are no idle workers
      expect(pool.getIdleWorker(trigger)).to.be.undefined;
    });

    it("exit() kills idle and busy workers", async () => {
      const pool = new RuntimeWorkerPool();
      const trigger = "trigger1";

      const busyWorker = pool.addWorker(trigger, new MockRuntimeInstance(true));
      const busyWorkerCounter = new WorkerStateCounter(busyWorker);

      const idleWorker = pool.addWorker(trigger, new MockRuntimeInstance(true));
      const idleWorkerCounter = new WorkerStateCounter(idleWorker);

      busyWorker.execute(new MockRuntimeBundle(trigger));
      pool.exit();

      await busyWorker.waitForDone();
      await idleWorker.waitForDone();

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

      const busyWorker = pool.addWorker(trigger, new MockRuntimeInstance(true));
      const busyWorkerCounter = new WorkerStateCounter(busyWorker);

      const idleWorker = pool.addWorker(trigger, new MockRuntimeInstance(true));
      const idleWorkerCounter = new WorkerStateCounter(idleWorker);

      busyWorker.execute(new MockRuntimeBundle(trigger));
      pool.refresh();

      await busyWorker.waitForDone();
      await idleWorker.waitForDone();

      expect(busyWorkerCounter.counts.BUSY).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHING).to.eql(1);
      expect(busyWorkerCounter.counts.FINISHED).to.eql(1);

      expect(idleWorkerCounter.counts.IDLE).to.eql(1);
      expect(idleWorkerCounter.counts.FINISHING).to.eql(0);
      expect(idleWorkerCounter.counts.FINISHED).to.eql(1);
    });
  });
});
