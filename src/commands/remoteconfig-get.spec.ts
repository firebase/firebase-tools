import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { command } from "./remoteconfig-get";
import * as rcGet from "../remoteconfig/get";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";

describe("remoteconfig:get", () => {
  let sandbox: sinon.SinonSandbox;
  let getTemplateStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let tmpDir: string;

  const actionFn = (
    command as unknown as {
      actionFn: (options: Options) => Promise<RemoteConfigTemplate>;
    }
  ).actionFn;

  const template: RemoteConfigTemplate = {
    conditions: [],
    parameters: {},
    parameterGroups: {},
    etag: "etag-123",
    version: { versionNumber: "6" },
  };

  function fakeOptions(extra: Record<string, unknown> = {}, src: unknown = {}): Options {
    return {
      project: "my-project",
      config: { src },
      ...extra,
    } as unknown as Options;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getTemplateStub = sandbox.stub(rcGet, "getTemplate").resolves(template);
    loggerInfoStub = sandbox.stub(logger, "info");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-get-"));
  });

  afterEach(() => {
    sandbox.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should fetch the latest template and print a table when no flags are passed", async () => {
    await actionFn(fakeOptions());

    expect(getTemplateStub).to.have.been.calledOnceWith("my-project", undefined);
    expect(loggerInfoStub).to.have.been.calledOnce;
  });

  it("should fetch the specified version when --version-number is passed", async () => {
    await actionFn(fakeOptions({ versionNumber: "3" }));

    expect(getTemplateStub).to.have.been.calledOnceWith("my-project", "3");
  });

  it("should write the template to the given filename when --output has a value", async () => {
    const out = path.join(tmpDir, "out.json");

    await actionFn(fakeOptions({ output: out }));

    const written = JSON.parse(fs.readFileSync(out, "utf8")) as RemoteConfigTemplate;
    expect(written.etag).to.equal("etag-123");
    expect(written.version).to.be.undefined;
    expect(loggerInfoStub).to.not.have.been.called;
  });

  it("should write to remoteconfig.template from firebase.json when --output has no value", async () => {
    const out = path.join(tmpDir, "default.json");

    await actionFn(fakeOptions({ output: true }, { remoteconfig: { template: out } }));

    expect(fs.existsSync(out)).to.be.true;
  });

  it("should throw a FirebaseError when --output has no value and no default template is configured", async () => {
    await expect(actionFn(fakeOptions({ output: true }))).to.be.rejectedWith(
      FirebaseError,
      /No output filename provided/,
    );
  });
});
