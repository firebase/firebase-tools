import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../../../prompt";
import * as config from "../../../config";
import * as ensureApiEnabled from "../../../ensureApiEnabled";
import { FirestoreApi } from "../../../firestore/api";
import { askQuestions, actuate } from "./index";
import * as rules from "./rules";
import * as indexes from "./indexes";
import { Setup } from "../..";

describe("firestore feature init", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should prompt for database id and location", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      sandbox.stub(ensureApiEnabled, "ensure").resolves();
      sandbox.stub(FirestoreApi.prototype, "listDatabases").resolves([]);
      sandbox.stub(FirestoreApi.prototype, "locations").resolves([
        {
          name: "projects/test-project/locations/us-central",
          locationId: "us-central",
          displayName: "us-central",
          labels: {},
          metadata: {},
        },
      ]);
      const selectStub = sandbox.stub(prompt, "select").resolves("us-central");
      const initRulesStub = sandbox.stub(rules, "initRules").resolves();
      const initIndexesStub = sandbox.stub(indexes, "initIndexes").resolves();

      await askQuestions(setup, cfg);

      expect(selectStub.calledOnce).to.be.true;
      expect(initRulesStub.calledOnce).to.be.true;
      expect(initIndexesStub.calledOnce).to.be.true;
    });
  });

  describe("actuate", () => {
    it("should write rules and indexes files", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        featureInfo: {
          firestore: {
            rulesFilename: "firestore.rules",
            rules: "rules content",
            writeRules: true,
            indexesFilename: "firestore.indexes.json",
            indexes: "indexes content",
            writeIndexes: true,
            databaseId: "(default)",
            locationId: "us-central",
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const writeStub = sandbox.stub(cfg, "writeProjectFile");

      await actuate(setup, cfg);

      expect(writeStub.calledTwice).to.be.true;
      expect(writeStub.firstCall.calledWith("firestore.rules", "rules content")).to.be.true;
      expect(writeStub.secondCall.calledWith("firestore.indexes.json", "indexes content")).to.be
        .true;
    });
  });
});
