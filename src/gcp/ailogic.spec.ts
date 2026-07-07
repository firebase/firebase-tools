import { expect } from "chai";
import * as sinon from "sinon";
import * as ailogic from "./ailogic";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as serviceUsage from "./serviceusage";
import * as rules from "./rules";
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

      const template = await ailogic.getTemplate("my-project", "global", "temp-1");

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

      const template = await ailogic.updateTemplate("my-project", "global", "temp-1", {
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

    it("should delete template", async () => {
      deleteStub.resolves({});

      await ailogic.deleteTemplate("my-project", "global", "temp-1");

      expect(deleteStub).to.have.been.calledWith(
        "projects/my-project/locations/global/templates/temp-1",
      );
    });

    it("should lock template", async () => {
      const mockTemplate: ailogic.Template = {
        name: "projects/my-project/locations/global/templates/temp-1",
        templateString: "hello",
        locked: true,
      };
      patchStub.resolves({ body: mockTemplate });

      const template = await ailogic.lockTemplate("my-project", "global", "temp-1");

      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1",
        { locked: true },
        {
          queryParams: {
            updateMask: "locked",
          },
        },
      );
      expect(template).to.deep.equal(mockTemplate);
    });

    it("should unlock template", async () => {
      const mockTemplate: ailogic.Template = {
        name: "projects/my-project/locations/global/templates/temp-1",
        templateString: "hello",
        locked: false,
      };
      patchStub.resolves({ body: mockTemplate });

      const template = await ailogic.unlockTemplate("my-project", "global", "temp-1");

      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/templates/temp-1",
        { locked: false },
        {
          queryParams: {
            updateMask: "locked",
          },
        },
      );
      expect(template).to.deep.equal(mockTemplate);
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

      const templates = await ailogic.listTemplates("my-project", "global");

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
    let uncacheStub: sinon.SinonStub;
    let checkStub: sinon.SinonStub;
    let billingStub: sinon.SinonStub;

    beforeEach(() => {
      ensureStub = sinon.stub(ensureApiEnabled, "ensure");
      disableStub = sinon.stub(serviceUsage, "disableServiceAndPoll");
      uncacheStub = sinon.stub(ensureApiEnabled, "uncacheEnabledAPI");
      checkStub = sinon.stub(ensureApiEnabled, "check");
      billingStub = sinon.stub(cloudbilling, "checkBillingEnabled");
    });

    afterEach(() => {
      ensureStub.restore();
      disableStub.restore();
      uncacheStub.restore();
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

    it("should enable agent-platform-gemini-api if billing is enabled", async () => {
      ensureStub.resolves();
      billingStub.resolves(true);

      await ailogic.enableProvider("my-project", "agent-platform-gemini-api");

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

    it("should reject enabling agent-platform-gemini-api if billing is disabled", async () => {
      ensureStub.resolves();
      billingStub.resolves(false);

      await expect(
        ailogic.enableProvider("my-project", "agent-platform-gemini-api"),
      ).to.be.rejectedWith(FirebaseError, /must be on the Blaze/);

      expect(ensureStub).to.not.have.been.called;
    });

    it("should disable gemini-developer-api and disable proxy if agent-platform-gemini-api is also disabled", async () => {
      disableStub.resolves();
      checkStub.resolves(false); // agent-platform-gemini-api is disabled

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
      expect(uncacheStub).to.have.been.calledTwice;
    });

    it("should disable gemini-developer-api but NOT disable proxy if agent-platform-gemini-api is enabled", async () => {
      disableStub.resolves();
      checkStub.resolves(true); // agent-platform-gemini-api is enabled

      await ailogic.disableProvider("my-project", "gemini-developer-api");

      expect(disableStub).to.have.been.calledOnce;
      expect(disableStub.firstCall).to.have.been.calledWith(
        "my-project",
        "generativelanguage.googleapis.com",
        "ailogic",
      );
      expect(uncacheStub).to.have.been.calledOnce;
    });

    it("should list enabled providers when billing is disabled", async () => {
      checkStub.onFirstCall().resolves(true); // gemini-developer-api is enabled
      checkStub.onSecondCall().resolves(true); // agent-platform-gemini-api API is enabled
      billingStub.resolves(false); // billing is disabled

      const enabled = await ailogic.listProviders("my-project");

      expect(enabled).to.deep.equal(["gemini-developer-api"]);
    });

    it("should list enabled providers when billing is enabled", async () => {
      checkStub.onFirstCall().resolves(true); // gemini-developer-api is enabled
      checkStub.onSecondCall().resolves(true); // agent-platform-gemini-api API is enabled
      billingStub.resolves(true); // billing is enabled

      const enabled = await ailogic.listProviders("my-project");

      expect(enabled).to.deep.equal(["gemini-developer-api", "agent-platform-gemini-api"]);
    });
  });

  describe("securityRules", () => {
    let listReleasesStub: sinon.SinonStub;
    let getLatestRulesetNameStub: sinon.SinonStub;
    let getRulesetContentStub: sinon.SinonStub;
    let createRulesetStub: sinon.SinonStub;
    let updateOrCreateReleaseStub: sinon.SinonStub;

    beforeEach(() => {
      listReleasesStub = sinon.stub(rules, "listAllReleases");
      getLatestRulesetNameStub = sinon.stub(rules, "getLatestRulesetName");
      getRulesetContentStub = sinon.stub(rules, "getRulesetContent");
      createRulesetStub = sinon.stub(rules, "createRuleset");
      updateOrCreateReleaseStub = sinon.stub(rules, "updateOrCreateRelease");
    });

    afterEach(() => {
      listReleasesStub.restore();
      getLatestRulesetNameStub.restore();
      getRulesetContentStub.restore();
      createRulesetStub.restore();
      updateOrCreateReleaseStub.restore();
    });

    it("should get rules and parse authOnly and templateOnly", async () => {
      listReleasesStub.resolves([]);
      getLatestRulesetNameStub.resolves("ruleset-name");
      getRulesetContentStub.resolves([
        {
          name: "vertexai.rules",
          content: `rules_version = '2';
service firebase.vertexai {
  match /projects/{project}/locations/{location} {
    match /templates/{template} {
      allow read: if request.auth != null;
    }
    match /models/{model} {
      allow read: if false;
    }
  }
}`,
        },
      ]);

      const config = await ailogic.getSecurityRules("my-project");

      expect(config).to.deep.equal({ authOnly: true, templateOnly: true });
    });

    it("should deploy rules with generateRulesContent", async () => {
      createRulesetStub.resolves("new-ruleset");
      updateOrCreateReleaseStub.resolves("release-name");

      await ailogic.updateSecurityRules("my-project", true, false);

      expect(createRulesetStub).to.have.been.calledWith("my-project", [
        {
          name: "vertexai.rules",
          content: ailogic.generateRulesContent(true, false),
        },
      ]);
      expect(updateOrCreateReleaseStub).to.have.been.calledWith(
        "my-project",
        "new-ruleset",
        "firebase.vertexai",
      );
    });
  });
});
