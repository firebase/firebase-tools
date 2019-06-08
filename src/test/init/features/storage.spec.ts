import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

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
      const setup = { config: {}, rcfile: {} };
      promptStub.returns("storage.rules");
      writeProjectFileStub.resolves();

      await doSetup(setup, new Config("/path/to/src", {}));

      expect(_.get(setup, "config.storage")).to.deep.equal("storage.rules");
    });
  });
});
