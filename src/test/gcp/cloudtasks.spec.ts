import { expect } from "chai";
import * as sinon from "sinon";

import * as iam from "../../gcp/iam";
import * as backend from "../../deploy/functions/backend";
import * as cloudtasks from "../../gcp/cloudtasks";
import * as proto from "../../gcp/proto";

describe("CloudTasks", () => {
  let ct: sinon.SinonStubbedInstance<typeof cloudtasks>;
  const ENDPOINT: backend.Endpoint & backend.TaskQueueTriggered = {
    platform: "gcfv2",
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "id",
    runtime: "nodejs16",
    taskQueueTrigger: {},
  };

  beforeEach(() => {
    ct = sinon.stub(cloudtasks);
    ct.queueNameForEndpoint.restore();
    ct.queueFromEndpoint.restore();
    ct.triggerFromQueue.restore();
    ct.setEnqueuer.restore();
    ct.upsertQueue.restore();
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("queueFromEndpoint", () => {
    it("handles minimal endpoints", () => {
      expect(cloudtasks.queueFromEndpoint(ENDPOINT)).to.deep.equal({
        ...cloudtasks.DEFAULT_SETTINGS,
        name: "projects/project/locations/region/queues/id",
      });
    });

    it("handles complex endpoints", () => {
      const rateLimits: backend.TaskQueueRateLimits = {
        maxConcurrentDispatches: 5,
        maxDispatchesPerSecond: 5,
      };
      const retryConfig: backend.TaskQueueRetryConfig = {
        maxAttempts: 10,
        maxDoublings: 9,
        maxBackoffSeconds: 60,
        maxRetrySeconds: 300,
        minBackoffSeconds: 1,
      };

      const ep: backend.Endpoint = {
        ...ENDPOINT,
        taskQueueTrigger: {
          rateLimits,
          retryConfig,
          invoker: ["robot@"],
        },
      };
      expect(cloudtasks.queueFromEndpoint(ep)).to.deep.equal({
        name: "projects/project/locations/region/queues/id",
        rateLimits,
        retryConfig: {
          maxAttempts: 10,
          maxDoublings: 9,
          maxRetryDuration: "300s",
          maxBackoff: "60s",
          minBackoff: "1s",
        },
        state: "RUNNING",
      });
    });
  });

  describe("triggerFromQueue", () => {
    it("handles queue with default settings", () => {
      expect(
        cloudtasks.triggerFromQueue({
          name: "projects/project/locations/region/queues/id",
          ...cloudtasks.DEFAULT_SETTINGS,
        }),
      ).to.deep.equal({
        rateLimits: { ...cloudtasks.DEFAULT_SETTINGS.rateLimits },
        retryConfig: {
          maxAttempts: cloudtasks.DEFAULT_SETTINGS.retryConfig?.maxAttempts,
          maxDoublings: cloudtasks.DEFAULT_SETTINGS.retryConfig?.maxDoublings,
          maxBackoffSeconds: proto.secondsFromDuration(
            cloudtasks.DEFAULT_SETTINGS.retryConfig?.maxBackoff || "",
          ),
          minBackoffSeconds: proto.secondsFromDuration(
            cloudtasks.DEFAULT_SETTINGS.retryConfig?.minBackoff || "",
          ),
        },
      });
    });

    it("handles queue with custom configs", () => {
      expect(
        cloudtasks.triggerFromQueue({
          name: "projects/project/locations/region/queues/id",
          rateLimits: {
            maxConcurrentDispatches: 5,
            maxDispatchesPerSecond: 5,
          },
          retryConfig: {
            maxAttempts: 10,
            maxDoublings: 9,
          },
        }),
      ).to.deep.equal({
        rateLimits: {
          maxConcurrentDispatches: 5,
          maxDispatchesPerSecond: 5,
        },
        retryConfig: {
          maxAttempts: 10,
          maxDoublings: 9,
        },
      });
    });
  });

  describe("upsertEndpoint", () => {
    it("accepts a matching queue", async () => {
      const queue: cloudtasks.Queue = {
        name: "projects/p/locations/r/queues/f",
        ...cloudtasks.DEFAULT_SETTINGS,
      };
      ct.getQueue.resolves(queue);

      await cloudtasks.upsertQueue(queue);

      expect(ct.getQueue).to.have.been.called;
      expect(ct.updateQueue).to.not.have.been.called;
      expect(ct.purgeQueue).to.not.have.been.called;
    });

    it("updates a non-matching queue", async () => {
      const wantQueue: cloudtasks.Queue = {
        name: "projects/p/locations/r/queues/f",
        ...cloudtasks.DEFAULT_SETTINGS,
        rateLimits: {
          maxConcurrentDispatches: 20,
        },
      };
      const haveQueue: cloudtasks.Queue = {
        name: "projects/p/locations/r/queues/f",
        ...cloudtasks.DEFAULT_SETTINGS,
      };
      ct.getQueue.resolves(haveQueue);

      await cloudtasks.upsertQueue(wantQueue);

      expect(ct.getQueue).to.have.been.called;
      expect(ct.updateQueue).to.have.been.called;
      expect(ct.purgeQueue).to.not.have.been.called;
    });

    it("purges a disabled queue", async () => {
      const wantQueue: cloudtasks.Queue = {
        name: "projects/p/locations/r/queues/f",
        ...cloudtasks.DEFAULT_SETTINGS,
      };
      const haveQueue: cloudtasks.Queue = {
        name: "projects/p/locations/r/queues/f",
        ...cloudtasks.DEFAULT_SETTINGS,
        state: "DISABLED",
      };
      ct.getQueue.resolves(haveQueue);

      await cloudtasks.upsertQueue(wantQueue);

      expect(ct.getQueue).to.have.been.called;
      expect(ct.updateQueue).to.have.been.called;
      expect(ct.purgeQueue).to.have.been.called;
    });
  });

  describe("setEnqueuer", () => {
    const NAME = "projects/p/locations/r/queues/f";
    const ADMIN_BINDING: iam.Binding = {
      role: "roles/cloudtasks.admin",
      members: ["user:sundar@google.com"],
    };
    // Not that anyone should actually make these public,
    // it makes for easier testing.
    const PUBLIC_ENQUEUER_BINDING: iam.Binding = {
      role: "roles/cloudtasks.enqueuer",
      members: ["allUsers"],
    };
    it("can blind-write", async () => {
      await cloudtasks.setEnqueuer(NAME, ["private"], /* assumeEmpty= */ true);
      expect(ct.getIamPolicy).to.not.have.been.called;
      expect(ct.setIamPolicy).to.not.have.been.called;

      await cloudtasks.setEnqueuer(NAME, ["public"], /* assumeEmpty= */ true);
      expect(ct.getIamPolicy).to.not.have.been.called;
      expect(ct.setIamPolicy).to.have.been.calledWith(NAME, {
        bindings: [PUBLIC_ENQUEUER_BINDING],
        etag: "",
        version: 3,
      });
    });

    it("preserves other roles", async () => {
      ct.getIamPolicy.resolves({
        bindings: [ADMIN_BINDING, PUBLIC_ENQUEUER_BINDING],
        etag: "",
        version: 3,
      });

      await cloudtasks.setEnqueuer(NAME, ["private"]);
      expect(ct.getIamPolicy).to.have.been.called;
      expect(ct.setIamPolicy).to.have.been.calledWith(NAME, {
        bindings: [ADMIN_BINDING],
        etag: "",
        version: 3,
      });
    });

    it("noops existing matches", async () => {
      ct.getIamPolicy.resolves({
        bindings: [ADMIN_BINDING, PUBLIC_ENQUEUER_BINDING],
        etag: "",
        version: 3,
      });

      await cloudtasks.setEnqueuer(NAME, ["public"]);
      expect(ct.getIamPolicy).to.have.been.called;
      expect(ct.setIamPolicy).to.not.have.been.called;
    });

    it("can insert an enqueuer binding", async () => {
      ct.getIamPolicy.resolves({
        bindings: [ADMIN_BINDING],
        etag: "",
        version: 3,
      });

      await cloudtasks.setEnqueuer(NAME, ["public"]);
      expect(ct.getIamPolicy).to.have.been.called;
      expect(ct.setIamPolicy).to.have.been.calledWith(NAME, {
        bindings: [ADMIN_BINDING, PUBLIC_ENQUEUER_BINDING],
        etag: "",
        version: 3,
      });
    });

    it("can resolve conflicts", async () => {
      ct.getIamPolicy.onCall(0).resolves({
        bindings: [ADMIN_BINDING],
        etag: "",
        version: 3,
      });
      ct.getIamPolicy.onCall(1).resolves({
        bindings: [ADMIN_BINDING],
        etag: "2",
        version: 3,
      });
      ct.setIamPolicy.onCall(0).rejects({ context: { response: { statusCode: 429 } } });

      await cloudtasks.setEnqueuer(NAME, ["public"]);
      expect(ct.getIamPolicy).to.have.been.calledTwice;
      expect(ct.setIamPolicy).to.have.been.calledTwice;
      expect(ct.setIamPolicy).to.have.been.calledWithMatch(NAME, {
        etag: "2",
      });
    });
  });
});
