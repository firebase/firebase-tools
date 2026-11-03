import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ext-dev-undeprecate";
import * as publisherApi from "../extensions/publisherApi";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { ExtensionVersion } from "../extensions/types";

const EXT_REF = "test-pub/test-ext";

describe("ext:dev:undeprecate", () => {
  let originalBefores: unknown[];
  let listStub: sinon.SinonStub;
  let undeprecateStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    originalBefores = (command as unknown as { befores: unknown[] }).befores;
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(utils, "logLabeledBullet");
    sinon.stub(utils, "logLabeledSuccess");
    listStub = sinon.stub(publisherApi, "listExtensionVersions").resolves([
      {
        ref: `${EXT_REF}@1.0.0`,
        state: "DEPRECATED",
        spec: { version: "1.0.0" },
      } as unknown as ExtensionVersion,
    ]);
    undeprecateStub = sinon.stub(publisherApi, "undeprecateExtensionVersion").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => {
    (command as unknown as { befores: unknown[] }).befores = originalBefores;
    sinon.restore();
  });

  it("registers a -f, --force flag", () => {
    const options = (command as unknown as { options: string[][] }).options;
    expect(options.map((o) => o[0])).to.include("-f, --force");
  });

  it("skips the confirmation prompt with --force", async () => {
    await command.runner()(EXT_REF, "1.0.0", { force: true, nonInteractive: true });
    expect(confirmStub).to.not.have.been.called;
    expect(listStub).to.have.been.calledWith(EXT_REF, 'id="1.0.0"');
    expect(undeprecateStub).to.have.been.calledOnceWith(`${EXT_REF}@1.0.0`);
  });

  it("passes --non-interactive through to the confirmation prompt", async () => {
    await command.runner()(EXT_REF, "1.0.0", { nonInteractive: true });
    expect(confirmStub).to.have.been.calledWithMatch({ default: false, nonInteractive: true });
  });

  it("points to --force when the confirmation is declined", async () => {
    confirmStub.resolves(false);
    await expect(command.runner()(EXT_REF, "1.0.0", {})).to.be.rejectedWith(
      FirebaseError,
      /Undeprecation canceled\..*--force/,
    );
    expect(undeprecateStub).to.not.have.been.called;
  });

  it("rejects an extension reference that includes a version", async () => {
    await expect(command.runner()(`${EXT_REF}@1.0.0`, "1.0.0", {})).to.be.rejectedWith(
      FirebaseError,
      /Version should be supplied in the version predicate argument/,
    );
    expect(listStub).to.not.have.been.called;
  });

  it("names the extension and predicate when no versions match", async () => {
    listStub.resolves([]);
    await expect(command.runner()(EXT_REF, ">=9.0.0", {})).to.be.rejectedWith(
      FirebaseError,
      /test-pub\/test-ext.*>=9\.0\.0/,
    );
  });
});
