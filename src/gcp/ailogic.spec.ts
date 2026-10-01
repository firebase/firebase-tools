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

  describe("getConfig", () => {
    let getStub: sinon.SinonStub;

    beforeEach(() => {
      getStub = sinon.stub(ailogic.client, "get");
    });

    afterEach(() => {
      getStub.restore();
    });

    it("should fetch config", async () => {
      const mockConfig: ailogic.Config = {
        name: "projects/my-project/locations/global/config",
        generativeLanguageConfig: { apiKey: "key" },
      };
      getStub.resolves({ body: mockConfig });

      const config = await ailogic.getConfig("my-project");

      expect(getStub).to.have.been.calledWithMatch("projects/my-project/locations/global/config");
      expect(config).to.deep.equal(mockConfig);
    });
  });

  describe("updateConfig", () => {
    let patchStub: sinon.SinonStub;

    beforeEach(() => {
      patchStub = sinon.stub(ailogic.client, "patch");
    });

    afterEach(() => {
      patchStub.restore();
    });

    it("should update config", async () => {
      const patchConfig: Partial<ailogic.Config> = {
        generativeLanguageConfig: { apiKey: "new-key" },
      };
      const mockConfig: ailogic.Config = {
        name: "projects/my-project/locations/global/config",
        generativeLanguageConfig: { apiKey: "new-key" },
      };
      patchStub.resolves({ body: mockConfig });

      const config = await ailogic.updateConfig("my-project", patchConfig, [
        "generativeLanguageConfig",
      ]);

      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/config",
        patchConfig,
        {
          queryParams: {
            updateMask: "generativeLanguageConfig",
          },
        },
      );
      expect(config).to.deep.equal(mockConfig);
    });
  });

  describe("templates", () => {
    let getStub: sinon.SinonStub;
    let patchStub: sinon.SinonStub;
    let deleteStub: sinon.SinonStub;
    let postStub: sinon.SinonStub;

    beforeEach(() => {
      getStub = sinon.stub(ailogic.client, "get");
      patchStub = sinon.stub(ailogic.client, "patch");
      deleteStub = sinon.stub(ailogic.client, "delete");
      postStub = sinon.stub(ailogic.client, "post");
    });

    afterEach(() => {
      getStub.restore();
      patchStub.restore();
      deleteStub.restore();
      postStub.restore();
    });

    it("should get template", async () => {
      const mockTemplate: ailogic.Template = {
        name: "projects/my-project/locations/global/templates/temp-1",
        templateString: "hello",
      };
      getStub.resolves({ body: mockTemplate });

      const template = await ailogic.getTemplate("my-project", "temp-1");

      expect(getStub).to.have.been.calledWith(
        "projects/my-project/locations/global/templates/temp-1",
      );
      expect(template).to.deep.equal(mockTemplate);
    });

    it("should update template", async () => {
      const mockTemplate: ailogic.Template = {
        name: "projects/my-project/locations/global/templates/temp-1",
        templateString: "hello",
      };
      patchStub.resolves({ body: mockTemplate });

      const template = await ailogic.updateTemplate("my-project", "temp-1", {
        templateString: "hello",
      });

      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1",
        { templateString: "hello" },
        {
          queryParams: {
            allowMissing: "true",
          },
        },
      );
      expect(template).to.deep.equal(mockTemplate);
    });

    it("should delete template without an etag by default", async () => {
      deleteStub.resolves({});

      await ailogic.deleteTemplate("my-project", "temp-1");

      expect(deleteStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1",
        { queryParams: {} },
      );
    });

    it("should pass the etag on delete when provided", async () => {
      deleteStub.resolves({});

      await ailogic.deleteTemplate("my-project", "temp-1", "etag-1");

      expect(deleteStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1",
        { queryParams: { etag: "etag-1" } },
      );
    });

    it("should pass the etag in the update body when provided", async () => {
      const mockTemplate: ailogic.Template = {
        name: "projects/my-project/locations/global/templates/temp-1",
        templateString: "hello",
      };
      patchStub.resolves({ body: mockTemplate });

      await ailogic.updateTemplate("my-project", "temp-1", {
        templateString: "hello",
        etag: "etag-1",
      });

      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1",
        { templateString: "hello", etag: "etag-1" },
      );
    });

    it("should lock a template via the ModifyLock RPC", async () => {
      postStub.resolves({ body: {} });

      await ailogic.setTemplateLocked("my-project", "temp-1", true);

      // `locked` is output-only on the resource, so this must NOT be a PATCH.
      expect(postStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1:modifyLock",
        { locked: true },
      );
      expect(patchStub).to.not.have.been.called;
    });

    it("should unlock a template via the ModifyLock RPC", async () => {
      postStub.resolves({ body: {} });

      await ailogic.setTemplateLocked("my-project", "temp-1", false);

      expect(postStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1:modifyLock",
        { locked: false },
      );
      expect(patchStub).to.not.have.been.called;
    });

    it("should list templates slurping all pages", async () => {
      getStub.onFirstCall().resolves({
        body: {
          templates: [{ name: "t1", templateString: "t1" }],
          nextPageToken: "next",
        },
      });
      getStub.onSecondCall().resolves({
        body: {
          templates: [{ name: "t2", templateString: "t2" }],
        },
      });

      const templates = await ailogic.listTemplates("my-project");

      expect(getStub).to.have.been.calledTwice;
      expect(templates).to.deep.equal([
        { name: "t1", templateString: "t1" },
        { name: "t2", templateString: "t2" },
      ]);
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

    it("should enable gemini-developer-api, enabling the AI Logic API first", async () => {
      ensureStub.resolves();

      await ailogic.enableProvider("my-project", "gemini-developer-api");

      expect(ensureStub).to.have.been.calledTwice;
      // The AI Logic API must be enabled before the provider API so a partial
      // failure cannot leave a provider on while AI Logic is off.
      expect(ensureStub.firstCall).to.have.been.calledWith(
        "my-project",
        "firebasevertexai.googleapis.com",
        "ailogic",
      );
      expect(ensureStub.secondCall).to.have.been.calledWith(
        "my-project",
        "generativelanguage.googleapis.com",
        "ailogic",
      );
    });

    it("should enable gemini-agent-platform-api if billing is enabled, enabling the AI Logic API first", async () => {
      ensureStub.resolves();
      billingStub.resolves(true);

      await ailogic.enableProvider("my-project", "gemini-agent-platform-api");

      expect(ensureStub).to.have.been.calledTwice;
      expect(ensureStub.firstCall).to.have.been.calledWith(
        "my-project",
        "firebasevertexai.googleapis.com",
        "ailogic",
      );
      expect(ensureStub.secondCall).to.have.been.calledWith(
        "my-project",
        "aiplatform.googleapis.com",
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

      // The cross-check must consult the OTHER provider's API.
      expect(checkStub).to.have.been.calledWith("my-project", "aiplatform.googleapis.com");
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
      checkStub
        .withArgs("my-project", "firebasevertexai.googleapis.com", "ailogic", true)
        .resolves(true);
      checkStub
        .withArgs("my-project", "generativelanguage.googleapis.com", "ailogic", true)
        .resolves(true);
      checkStub.withArgs("my-project", "aiplatform.googleapis.com", "ailogic", true).resolves(true);

      const enabled = await ailogic.listProviders("my-project");

      expect(enabled).to.deep.equal(["gemini-developer-api", "gemini-agent-platform-api"]);
    });

    it("should map each provider to its own API enablement state", async () => {
      // Pin per-API results so a swapped destructure/check cannot pass.
      checkStub.withArgs("my-project", "firebasevertexai.googleapis.com").resolves(true);
      checkStub.withArgs("my-project", "generativelanguage.googleapis.com").resolves(true);
      checkStub.withArgs("my-project", "aiplatform.googleapis.com").resolves(false);

      const enabled = await ailogic.listProviders("my-project");

      expect(enabled).to.deep.equal(["gemini-developer-api"]);
    });

    it("should list no providers when the AI Logic API is disabled, even if provider APIs are enabled", async () => {
      checkStub
        .withArgs("my-project", "firebasevertexai.googleapis.com", "ailogic", true)
        .resolves(false);
      checkStub
        .withArgs("my-project", "generativelanguage.googleapis.com", "ailogic", true)
        .resolves(true);
      checkStub.withArgs("my-project", "aiplatform.googleapis.com", "ailogic", true).resolves(true);

      const enabled = await ailogic.listProviders("my-project");

      expect(enabled).to.deep.equal([]);
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

  describe("assertValidTemplateId", () => {
    it("accepts URL-safe ids", () => {
      expect(() => ailogic.assertValidTemplateId("welcome")).to.not.throw();
      expect(() => ailogic.assertValidTemplateId("v2.greeting_A-1")).to.not.throw();
    });

    it("rejects ids that would address a different REST resource", () => {
      for (const bad of ["welcome#old", "welcome?x=1", "..", "../foo", "a/b", ".hidden", ""]) {
        expect(() => ailogic.assertValidTemplateId(bad), bad).to.throw(
          FirebaseError,
          /Invalid template id/,
        );
      }
    });
  });
});
