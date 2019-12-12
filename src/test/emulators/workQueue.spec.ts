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
      queue = new WorkQueue(FunctionsExecutionMode.AUTO);
      queue.start();
    });

    afterEach(() => {
      if (queue) {
        queue.stop();
      }
    });

    it("never runs a job immediately", async () => {
      let hasRun = false;
      const work = () => {
        hasRun = true;
        return Promise.resolve();
      };

      queue.submit(work);
      expect(!hasRun, "hasRun=false");
      await resolveIn(10);
      expect(hasRun, "hasRun=true");
    });

    it("runs two jobs", async () => {
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

      expect(!hasRun1, "hasRun1=false");
      expect(!hasRun2, "hasRun2=false");
      await resolveIn(10);

      expect(hasRun1 && hasRun2, "hasRun1 && hasRun2");
    });
  });

  describe("mode=SEQUENTIAL", () => {
    let queue: WorkQueue;
    beforeEach(() => {
      queue = new WorkQueue(FunctionsExecutionMode.SEQUENTIAL);
      queue.start();
    });

    afterEach(() => {
      if (queue) {
        queue.stop();
      }
    });

    it("finishes one job before running another", async () => {
      const timeout = 50;

      let hasRun1 = false;
      const work1 = async () => {
        await resolveIn(timeout);
        hasRun1 = true;
      };

      let hasRun2 = false;
      const work2 = async () => {
        await resolveIn(timeout);
        hasRun2 = true;
      };

      queue.submit(work1);
      queue.submit(work2);

      await resolveIn(timeout + 10);

      expect(hasRun1, "job 1 finished");
      expect(!hasRun2, "job 2 not finished");

      await resolveIn(timeout + 10);
      expect(hasRun2, "both jobs finished");
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
