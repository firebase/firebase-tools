import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as Config from "../../../config";
import { doSetup } from "../../../init/features/storage";
import * as prompt from "../../../prompt";

describe("storage", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let writeProjectFileStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    writeProjectFileStub = sandbox.stub(Config.prototype, "writeProjectFile");
    promptStub = sandbox.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    it("should set up the correct properties in the project", async () => {
      const setup = {
        config: {},
        rcfile: {},
        projectId: "my-project-123",
        projectLocation: "us-central",
      };
      promptStub.returns("storage.rules");
      writeProjectFileStub.resolves();

      await doSetup(setup, new Config("/path/to/src", {}));

      expect(_.get(setup, "config.storage.rules")).to.deep.equal("storage.rules");
    });

    it("should error when cloud resource location is not set", async () => {
      const setup = {
        config: {},
        rcfile: {},
        projectId: "my-project-123",
      };

      await expect(doSetup(setup, new Config("/path/to/src", {}))).to.eventually.be.rejectedWith(
        FirebaseError,
        "Cloud resource location is not set"
      );
    });
  });
});
