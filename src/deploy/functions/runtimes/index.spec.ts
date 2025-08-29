import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { getRuntimeDelegate, DelegateContext } from ".";
import * as discovery from "./discovery";

describe("runtimes.getRuntimeDelegate (safeMode)", () => {
  const yaml = `specVersion: v1alpha1\nendpoints:\n  hello:\n    httpsTrigger: {}\n    entryPoint: hello\n`;

  it("selects python delegate when safeMode=true and runtime=python", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-safe-rt-"));
    fs.writeFileSync(path.join(tmp, "functions.yaml"), yaml, "utf8");

    const ctx: DelegateContext = {
      projectId: "p",
      projectDir: "/project",
      sourceDir: tmp,
      runtime: "python312",
      safeMode: true,
    };
    const delegate = await getRuntimeDelegate(ctx);
    expect(delegate.language).to.equal("python");
  });

  it("selects node delegate when safeMode=true and runtime=node", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-safe-rt-"));
    fs.writeFileSync(path.join(tmp, "functions.yaml"), yaml, "utf8");

    const ctx: DelegateContext = {
      projectId: "p",
      projectDir: "/project",
      sourceDir: tmp,
      runtime: "nodejs20",
      safeMode: true,
    };
    const delegate = await getRuntimeDelegate(ctx);
    expect(delegate.language).to.equal("nodejs");
  });

  it("node delegate discoverBuild uses manifest-only in safeMode", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-safe-rt-"));
    fs.writeFileSync(path.join(tmp, "functions.yaml"), yaml, "utf8");

    const detectFromPortStub = sinon.stub(discovery, "detectFromPort");

    const ctx: DelegateContext = {
      projectId: "p",
      projectDir: "/project",
      sourceDir: tmp,
      runtime: "nodejs20",
      safeMode: true,
    };
    const delegate = await getRuntimeDelegate(ctx);
    const build = await delegate.discoverBuild({}, {});
    expect(build.endpoints).to.have.property("hello");
    expect(detectFromPortStub.called).to.equal(false);
    detectFromPortStub.restore();
  });
});

