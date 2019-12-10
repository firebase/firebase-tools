import { expect } from "chai";

import { WorkQueue } from "../../emulator/workQueue";
import { FunctionsExecutionMode } from "../../emulator/types";

function resolveIn(ms: number) {
  if (ms === 0) {
    return Promise.resolve();
  }

  return new Promise((res, rej) => {
    setTimeout(res, ms);
  });
}

describe("WorkQueue", () => {
  describe("mode=AUTO", () => {
    let queue: WorkQueue;
    beforeEach(() => {
      if (queue) {
        queue.stop();
      }
      queue = new WorkQueue(FunctionsExecutionMode.AUTO);
      queue.start();
    });

    it("runs a job immediately", () => {
      let hasRun = false;
      const work = () => {
        hasRun = true;
        return Promise.resolve();
      };

      queue.submit(work);
      expect(hasRun, "hasRun");
    });

    it("runs two jobs immediately", () => {
      let hasRun1 = false;
      const work1 = () => {
        hasRun1 = true;
        return Promise.resolve();
      };

      let hasRun2 = false;
      const work2 = () => {
        hasRun2 = true;
        return Promise.resolve();
      };

      queue.submit(work1);
      queue.submit(work2);

      expect(hasRun1 && hasRun2, "hasRun1 && hasRun2");
    });
  });

  describe("mode=SEQUENTIAL", () => {
    let queue: WorkQueue;
    beforeEach(() => {
      if (queue) {
        queue.stop();
      }
      queue = new WorkQueue(FunctionsExecutionMode.SEQUENTIAL);
      queue.start();
    });

    it("finishes one job before running another", async () => {
      const timeout = 500;

      let hasRun1 = false;
      const work1 = () => {
        hasRun1 = true;
        return resolveIn(timeout);
      };

      let hasRun2 = false;
      const work2 = () => {
        hasRun2 = true;
        return Promise.resolve();
      };

      queue.submit(work1);
      queue.submit(work2);

      expect(hasRun1, "hasRun1 immediately");
      expect(!hasRun2, "hasRun2 waits to startt");

      // Wait for job 1 to finish (with some wiggle room)
      await resolveIn(timeout * 1.5);
      expect(hasRun2, "hasRun2 runs after hasRun1 is done");
    });

    it("proceeds even if a job errors out", () => {
      let hasRun1 = false;
      const work1 = () => {
        hasRun1 = true;
        return Promise.reject();
      };

      let hasRun2 = false;
      const work2 = () => {
        hasRun2 = true;
        return Promise.resolve();
      };

      queue.submit(work1);
      queue.submit(work2);

      expect(hasRun1, "hasRun1");
      expect(hasRun2, "hasRun2");
    });
  });
});
