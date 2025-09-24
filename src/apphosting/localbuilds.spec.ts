import { localBuild } from "./localbuilds";
import * as sinon from "sinon";
import { expect } from "chai";
import * as localBuildModule from "@apphosting/build";
import { OutputBundleConfig } from "@apphosting/common";
// import { BuildConfig, Env } from "../gcp/apphosting";

describe("localBuild", () => {
  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("returns the expected output", async () => {
    const bundleConfig: OutputBundleConfig = {
      version: "v1",
      runConfig: {
        runCommand: "npm run build:prod",
      },
      metadata: {
        adapterPackageName: "@apphosting/angular-adapter",
        adapterVersion: "14.1",
        framework: "nextjs",
      },
      outputFiles: {
        serverApp: {
          include: ["./next/standalone/"],
        },
      },
    };
    const expectedAnnotations = {
      adapterPackageName: "@apphosting/angular-adapter",
      adapterVersion: "14.1",
      framework: "nextjs",
    };
    const expectedBuildConfig = {
      outputFiles: ["./nextstandalone/"],
      runCommand: "npm run build:prod",
      env: [],
    };
    const localApphostingBuildStub: sinon.SinonStub = sinon
      .stub(localBuildModule, "localBuild")
      .resolves(bundleConfig);
    const { annotations, buildConfig } = await localBuild("./", "nextjs");
    expect(annotations).to.deep.equal(expectedAnnotations);
    expect(buildConfig).to.deep.equal(expectedBuildConfig);
    sinon.assert.calledWith(localApphostingBuildStub, "./", "nextjs");
  });
});
