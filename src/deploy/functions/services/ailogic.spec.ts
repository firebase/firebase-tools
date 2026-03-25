import { AILogicService } from "./ailogic";
import * as backend from "../backend";
import { expect } from "chai";
import * as ailogicApi from "../../../gcp/ailogic";
import * as sinon from "sinon";

const BASE_EP = {
  id: "id",
  region: "us-central1",
  project: "project",
  entryPoint: "func",
  platform: "gcfv2" as const,
};

const BEFORE_GENERATE = "firebase.vertexai.v1beta.beforeGenerateContent";
const AFTER_GENERATE = "firebase.vertexai.v1beta.afterGenerateContent";

describe("AILogicService", () => {
  const service = new AILogicService();
  let upsertStub: sinon.SinonStub;
  let deleteStub: sinon.SinonStub;

  beforeEach(() => {
    upsertStub = sinon.stub(ailogicApi, "upsertBlockingFunction").resolves();
    deleteStub = sinon.stub(ailogicApi, "deleteBlockingFunction").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("validateTrigger", () => {
    it("should throw if two regional triggers of same type in same region", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        id: "func1",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
          options: { regionalWebhook: true },
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        id: "func2",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
          options: { regionalWebhook: true },
        },
      };

      expect(() => service.validateTrigger(ep1, backend.of(ep1, ep2))).to.throw(
        `Can only create at most one regional AI Logic Trigger for ${BEFORE_GENERATE} in region us-central1`,
      );
    });

    it("should NOT throw if two regional triggers of same type in DIFFERENT regions", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        id: "func1",
        region: "us-central1",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
          options: { regionalWebhook: true },
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        id: "func2",
        region: "us-east1",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
          options: { regionalWebhook: true },
        },
      };

      expect(() => service.validateTrigger(ep1, backend.of(ep1, ep2))).to.not.throw();
    });

    it("should throw if two global triggers of same type", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        id: "func1",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        id: "func2",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
        },
      };

      expect(() => service.validateTrigger(ep1, backend.of(ep1, ep2))).to.throw(
        `Can only create at most one global AI Logic Trigger for ${BEFORE_GENERATE}`,
      );
    });

    it("should NOT throw if one regional and one global of same type", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        id: "func1",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
          options: { regionalWebhook: true },
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        id: "func2",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
        },
      };

      expect(() => service.validateTrigger(ep1, backend.of(ep1, ep2))).to.not.throw();
    });

    it("should NOT throw if two different types", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        id: "func1",
        blockingTrigger: {
          eventType: BEFORE_GENERATE,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        id: "func2",
        blockingTrigger: {
          eventType: AFTER_GENERATE,
        },
      };

      expect(() => service.validateTrigger(ep1, backend.of(ep1, ep2))).to.not.throw();
    });
  });

  describe("registerTrigger", () => {
    it("should call upsertBlockingFunction", async () => {
      const ep: backend.Endpoint = {
        ...BASE_EP,
        blockingTrigger: { eventType: BEFORE_GENERATE },
      };

      await service.registerTrigger(ep);

      expect(upsertStub).to.have.been.calledOnceWith(ep);
    });
  });

  describe("unregisterTrigger", () => {
    it("should call deleteBlockingFunction", async () => {
      const ep: backend.Endpoint = {
        ...BASE_EP,
        blockingTrigger: { eventType: BEFORE_GENERATE },
      };

      await service.unregisterTrigger(ep);

      expect(deleteStub).to.have.been.calledOnceWith(ep);
    });
  });
});
