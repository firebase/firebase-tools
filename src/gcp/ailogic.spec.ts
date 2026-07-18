import { expect } from "chai";
import * as sinon from "sinon";
import * as ailogic from "./ailogic";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as serviceUsage from "./serviceusage";
import * as cloudbilling from "./cloudbilling";
import {
  AI_LOGIC_BEFORE_GENERATE_CONTENT,
  AI_LOGIC_AFTER_GENERATE_CONTENT,
  AILogicEndpoint,
} from "../deploy/functions/services/ailogic";
import { FirebaseError } from "../error";

describe("ailogic", () => {
  const mockEndpointBase = {
    id: "my-func",
    region: "us-central1",
    project: "my-project",
    entryPoint: "myFunc",
    platform: "gcfv2",
  } as const;

  describe("upsertBlockingFunction", () => {
    let postStub: sinon.SinonStub;
    let patchStub: sinon.SinonStub;

    beforeEach(() => {
      postStub = sinon.stub(ailogic.client, "post");
      patchStub = sinon.stub(ailogic.client, "patch");
    });

    afterEach(() => {
      postStub.restore();
      patchStub.restore();
    });

    it("should create trigger for beforeGenerateContent", async () => {
      const endpoint: AILogicEndpoint = {
        ...mockEndpointBase,
        blockingTrigger: {
          eventType: AI_LOGIC_BEFORE_GENERATE_CONTENT,
        },
      };

      postStub.resolves({ body: { name: "trigger-name" } });

      await ailogic.upsertBlockingFunction(endpoint);

      expect(postStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/triggers",
        {
          cloudFunction: {
            id: "my-func",
            locationId: "us-central1",
          },
        },
        {
          queryParams: {
            triggerId: "before-generate-content",
            validateOnly: "false",
          },
        },
      );
    });

    it("should update trigger if create fails with 409", async () => {
      const endpoint: AILogicEndpoint = {
        ...mockEndpointBase,
        blockingTrigger: {
          eventType: AI_LOGIC_AFTER_GENERATE_CONTENT,
          options: {
            regionalWebhook: true,
          },
        },
      };

      postStub.rejects({ status: 409 });
      patchStub.resolves({ body: { name: "trigger-name" } });

      await ailogic.upsertBlockingFunction(endpoint);

      expect(postStub).to.have.been.calledOnce;
      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/us-central1/triggers/after-generate-content",
        {
          cloudFunction: {
            id: "my-func",
            locationId: "us-central1",
          },
        },
        {
          queryParams: {
            allowMissing: "false",
            validateOnly: "false",
          },
        },
      );
    });

    it("should throw error if create fails with non-409", async () => {
      const endpoint: AILogicEndpoint = {
        ...mockEndpointBase,
        blockingTrigger: {
          eventType: AI_LOGIC_BEFORE_GENERATE_CONTENT,
        },
      };

      postStub.rejects({ status: 500 });

      await expect(ailogic.upsertBlockingFunction(endpoint)).to.be.rejectedWith();
      expect(patchStub).to.not.have.been.called;
    });
  });

  describe("deleteBlockingFunction", () => {
    let deleteStub: sinon.SinonStub;

    beforeEach(() => {
      deleteStub = sinon.stub(ailogic.client, "delete");
    });

    afterEach(() => {
      deleteStub.restore();
    });

    it("should delete trigger", async () => {
      const endpoint: AILogicEndpoint = {
        ...mockEndpointBase,
        blockingTrigger: {
          eventType: AI_LOGIC_BEFORE_GENERATE_CONTENT,
        },
      };

      deleteStub.resolves({});

      await ailogic.deleteBlockingFunction(endpoint);

      expect(deleteStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/triggers/before-generate-content",
        {
          queryParams: {
            allowMissing: "true",
            validateOnly: "false",
          },
        },
      );
    });
  });

  describe("providers", () => {
    let ensureStub: sinon.SinonStub;
    let disableStub: sinon.SinonStub;
    let checkStub: sinon.SinonStub;
    let billingStub: sinon.SinonStub;

    beforeEach(() => {
      ensureStub = sinon.stub(ensureApiEnabled, "ensure");
      // disableServiceAndPoll now owns cache invalidation, so it is stubbed here and
      // that behavior is verified in serviceusage.spec.ts.
      disableStub = sinon.stub(serviceUsage, "disableServiceAndPoll");
      checkStub = sinon.stub(ensureApiEnabled, "check");
      billingStub = sinon.stub(cloudbilling, "checkBillingEnabled");
    });

    afterEach(() => {
      ensureStub.restore();
      disableStub.restore();
      checkStub.restore();
      billingStub.restore();
    });

    it("should enable gemini-developer-api", async () => {
      ensureStub.resolves();

      await ailogic.enableProvider("my-project", "gemini-developer-api");

      expect(ensureStub).to.have.been.calledTwice;
      expect(ensureStub.firstCall).to.have.been.calledWith(
        "my-project",
        "generativelanguage.googleapis.com",
        "ailogic",
      );
      expect(ensureStub.secondCall).to.have.been.calledWith(
        "my-project",
        "firebasevertexai.googleapis.com",
        "ailogic",
      );
    });

    it("should enable gemini-agent-platform-api if billing is enabled", async () => {
      ensureStub.resolves();
      billingStub.resolves(true);

      await ailogic.enableProvider("my-project", "gemini-agent-platform-api");

      expect(ensureStub).to.have.been.calledTwice;
      expect(ensureStub.firstCall).to.have.been.calledWith(
        "my-project",
        "aiplatform.googleapis.com",
        "ailogic",
      );
      expect(ensureStub.secondCall).to.have.been.calledWith(
        "my-project",
        "firebasevertexai.googleapis.com",
        "ailogic",
      );
    });

    it("should reject enabling gemini-agent-platform-api if billing is disabled", async () => {
      ensureStub.resolves();
      billingStub.resolves(false);

      await expect(
        ailogic.enableProvider("my-project", "gemini-agent-platform-api"),
      ).to.be.rejectedWith(FirebaseError, /must be on the Blaze/);

      expect(ensureStub).to.not.have.been.called;
    });

    it("should disable gemini-developer-api and disable proxy if gemini-agent-platform-api is also disabled", async () => {
      disableStub.resolves();
      checkStub.resolves(false); // gemini-agent-platform-api is disabled

      await ailogic.disableProvider("my-project", "gemini-developer-api");

      expect(disableStub).to.have.been.calledTwice;
      expect(disableStub.firstCall).to.have.been.calledWith(
        "my-project",
        "generativelanguage.googleapis.com",
        "ailogic",
      );
      expect(disableStub.secondCall).to.have.been.calledWith(
        "my-project",
        "firebasevertexai.googleapis.com",
        "ailogic",
      );
    });

    it("should disable gemini-developer-api but NOT disable proxy if gemini-agent-platform-api is enabled", async () => {
      disableStub.resolves();
      checkStub.resolves(true); // gemini-agent-platform-api is enabled

      await ailogic.disableProvider("my-project", "gemini-developer-api");

      expect(disableStub).to.have.been.calledOnce;
      expect(disableStub.firstCall).to.have.been.calledWith(
        "my-project",
        "generativelanguage.googleapis.com",
        "ailogic",
      );
    });

    it("should list enabled providers", async () => {
      checkStub.onFirstCall().resolves(true); // gemini-developer-api is enabled
      checkStub.onSecondCall().resolves(true); // gemini-agent-platform-api API is enabled

      const enabled = await ailogic.listProviders("my-project");

      expect(enabled).to.deep.equal(["gemini-developer-api", "gemini-agent-platform-api"]);
    });
  });

  describe("parseProviderType", () => {
    it("returns the provider for a valid value", () => {
      expect(ailogic.parseProviderType("gemini-developer-api")).to.equal("gemini-developer-api");
      expect(ailogic.parseProviderType("gemini-agent-platform-api")).to.equal(
        "gemini-agent-platform-api",
      );
    });

    it("throws a FirebaseError listing the valid providers for an invalid value", () => {
      expect(() => ailogic.parseProviderType("agent-platform-gemini-api")).to.throw(
        FirebaseError,
        /Invalid provider type/,
      );
    });

    it("isProviderType narrows valid values only", () => {
      expect(ailogic.isProviderType("gemini-developer-api")).to.be.true;
      expect(ailogic.isProviderType("nope")).to.be.false;
    });
  });
});
