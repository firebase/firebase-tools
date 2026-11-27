import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../../../prompt";
import * as config from "../../../config";
import { initIndexes, INDEXES_TEMPLATE } from "./indexes";
import { FirestoreApi } from "../../../firestore/api";
import { Setup } from "../..";

describe("firestore indexes", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("initIndexes", () => {
    it("should prompt for indexes file and write default indexes", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const inputStub = sandbox.stub(prompt, "input").resolves("firestore.indexes.json");
      const writeStub = sandbox.stub(cfg, "confirmWriteProjectFile").resolves(true);

      await initIndexes(setup, cfg, {
        databaseId: "(default)",
        indexesFilename: "",
        indexes: "",
        writeIndexes: false,
        rulesFilename: "",
        rules: "",
        writeRules: false,
        locationId: "",
      });

      expect(inputStub.calledOnce).to.be.true;
      expect(writeStub.calledOnceWith("firestore.indexes.json", INDEXES_TEMPLATE)).to.be.true;
    });

    it("should download indexes from console", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const listIndexesStub = sandbox.stub(FirestoreApi.prototype, "listIndexes").resolves([]);
      const listFieldOverridesStub = sandbox
        .stub(FirestoreApi.prototype, "listFieldOverrides")
        .resolves([]);
      const makeIndexSpecStub = sandbox
        .stub(FirestoreApi.prototype, "makeIndexSpec")
        .returns({ indexes: [], fieldOverrides: [] });
      const writeStub = sandbox.stub(cfg, "confirmWriteProjectFile").resolves(true);

      const info = {
        databaseId: "(default)",
        indexesFilename: "firestore.indexes.json",
        indexes: "",
        writeIndexes: false,
        rulesFilename: "",
        rules: "",
        writeRules: false,
        locationId: "",
      };
      await initIndexes(setup, cfg, info);

      expect(listIndexesStub.calledOnceWith("test-project", "(default)")).to.be.true;
      expect(listFieldOverridesStub.calledOnceWith("test-project", "(default)")).to.be.true;
      expect(makeIndexSpecStub.calledOnceWith([], [])).to.be.true;
      expect(
        writeStub.calledOnceWith(
          "firestore.indexes.json",
          JSON.stringify({ indexes: [], fieldOverrides: [] }, null, 2),
        ),
      ).to.be.true;
      expect(info.indexes).to.equal(JSON.stringify({ indexes: [], fieldOverrides: [] }, null, 2));
    });
  });
});
