import { expect } from "chai";
import * as sinon from "sinon";

import * as node from ".";
import * as discovery from "../discovery";
import { FirebaseError } from "../../../../error";

const PROJECT_ID = "test-project";
const PROJECT_DIR = "/some/path";
const SOURCE_DIR = "/some/path/fns";

describe("NodeDelegate", () => {
  describe("discoverBuild", () => {
    let sandbox: sinon.SinonSandbox;
    let delegate: node.Delegate;
    let detectFromYamlStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, "nodejs16");
      detectFromYamlStub = sandbox.stub(discovery, "detectFromYaml");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should throw error if SDK version is invalid", async () => {
      sandbox.stub(delegate, "sdkVersion").get(() => "invalid");

      await expect(delegate.discoverBuild({}, {})).to.be.rejectedWith(FirebaseError, /Could not parse firebase-functions version/);
    });

    it("should throw error if SDK version is too old", async () => {
      sandbox.stub(delegate, "sdkVersion").get(() => "3.19.0");

      await expect(delegate.discoverBuild({}, {})).to.be.rejectedWith(FirebaseError, /You are using an old version of firebase-functions SDK/);
    });

    it("should proceed if SDK version is new enough", async () => {
        sandbox.stub(delegate, "sdkVersion").get(() => "3.20.0");
        detectFromYamlStub.resolves({ endpoints: {}, requiredAPIs: [], params: [] });

        await delegate.discoverBuild({}, {});

        expect(detectFromYamlStub).to.have.been.called;
      });
  });
});
