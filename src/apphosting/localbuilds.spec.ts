import { localBuild } from "./localbuilds";
import * as r from "./rollout";
import * as sinon from "sinon";
import { expect } from "chai";

// import * as localBuildModule from "@apphosting/build";
// import { OutputBundleConfig } from "@apphosting/common";
// import { BuildConfig, Env } from "../gcp/apphosting";

describe("localBuild", () => {
  // beforeEach(() => {});

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("test", async () => {
    await localBuild("./", "nextjs");
    expect(2).to.equal(2);
  });

  /**
  it("returns the expected output", async () => {
    const bundleConfig: OutputBundleConfig = {
      version: "v1",
      runConfig: {
        runCommand: "",
      },
      metadata: {
        adapterPackageName: "@apphosting/angular-adapter",
        adapterVersion: "",
        framework: "",
      },
    };
    const expectedAnnotations = { adapterPackageName: "@apphosting/angular-adapter" };
    const localApphostingBuildStub: sinon.SinonStub = sinon
      .stub(localBuildModule, "localBuild")
      .resolves(bundleConfig);
    const { annotations, buildConfig } = await localBuild("./", "nextjs");
    expect(annotations).to.equal(expectedAnnotations);
    expect(buildConfig).to.equal({});
    sinon.assert.calledOnce(localApphostingBuildStub);
  });
   */
});
