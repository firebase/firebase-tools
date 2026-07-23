import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ailogic-config-get";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("ailogic:config:get", () => {
  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(ailogic, "isAILogicApiEnabled").resolves(true);
    sinon.stub(ailogic, "listProviders").resolves(["gemini-developer-api"]);
    sinon.stub(ailogic, "getConfig").resolves({
      name: "config",
      trafficFilter: { firebaseAuthRequired: true, templateOnly: false },
      telemetryConfig: { mode: "ALL", samplingRate: 0.5 },
    });
  });

  afterEach(() => sinon.restore());

  it("returns a structured config with mapped values", async () => {
    expect(await command.runner()(undefined, { project: PROJECT_ID })).to.deep.equal({
      providers: {
        "gemini-developer-api": true,
        "gemini-agent-platform-api": false,
      },
      security: { "auth-only": true, "template-only": false },
      monitoring: { state: true, "sample-rate-percentage": 50 },
    });
  });

  it("returns a single value for a valid path", async () => {
    expect(await command.runner()("security.auth-only", { project: PROJECT_ID })).to.equal(true);
  });

  it("returns a nested object for a group path", async () => {
    expect(await command.runner()("monitoring", { project: PROJECT_ID })).to.deep.equal({
      state: true,
      "sample-rate-percentage": 50,
    });
  });

  it("throws on an unknown path", async () => {
    await expect(command.runner()("security.authonly", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /Unknown configuration path/,
    );
  });

  it("returns early when AI Logic is not enabled", async () => {
    (ailogic.isAILogicApiEnabled as sinon.SinonStub).resolves(false);
    expect(await command.runner()(undefined, { project: PROJECT_ID })).to.be.undefined;
  });
});
