import * as sinon from "sinon";
import { expect } from "chai";
import * as localBuildModule from "@apphosting/build";
import { localBuild } from "./localbuilds";
import * as secrets from "./secrets";

describe("localBuild", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("returns the expected output", async () => {
    const bundleConfig = {
      version: "v1" as const,
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
          include: ["./next/standalone"],
        },
      },
    };
    const expectedAnnotations = {
      adapterPackageName: "@apphosting/angular-adapter",
      adapterVersion: "14.1",
      framework: "nextjs",
    };
    const expectedOutputFiles = ["./next/standalone"];
    const expectedBuildConfig = {
      runCommand: "npm run build:prod",
      env: [],
    };
    const localApphostingBuildStub: sinon.SinonStub = sinon
      .stub(localBuildModule, "localBuild")
      .resolves(bundleConfig);
    const { outputFiles, annotations, buildConfig } = await localBuild(
      "test-project",
      "./",
      "nextjs",
    );
    expect(annotations).to.deep.equal(expectedAnnotations);
    expect(buildConfig).to.deep.equal(expectedBuildConfig);
    expect(outputFiles).to.deep.equal(expectedOutputFiles);
    sinon.assert.calledWith(localApphostingBuildStub, "./", "nextjs");
  });

  it("resolves BUILD-available secrets passed in the environment map and ignores RUNTIME-only ones", async () => {
    const bundleConfig = {
      version: "v1" as const,
      runConfig: { runCommand: "npm run build:prod" },
      metadata: {
        adapterPackageName: "@apphosting/angular-adapter",
        adapterVersion: "14.1",
        framework: "nextjs",
      },
      outputFiles: { serverApp: { include: ["./next/standalone"] } },
    };
    sinon.stub(localBuildModule, "localBuild").callsFake(async () => {
      expect(process.env.MY_BUILD_SECRET).to.equal("secret-value");
      expect(process.env.MY_RUNTIME_SECRET).to.be.undefined;
      expect(process.env.MY_PLAIN_VAR).to.equal("plain-value");
      return bundleConfig;
    });
    const loadSecretStub = sinon.stub(secrets, "loadSecret").resolves("secret-value");

    const envMap = {
      MY_BUILD_SECRET: { secret: "my-secret-id", availability: ["BUILD"] },
      MY_RUNTIME_SECRET: { secret: "runtime-only-id", availability: ["RUNTIME"] },
      MY_PLAIN_VAR: { value: "plain-value" },
    };

    await localBuild("test-project", "./", "nextjs", envMap);

    expect(loadSecretStub).to.have.been.calledWith("test-project", "my-secret-id");
    // Confirm RUNTIME-only secret was ignored
    expect(loadSecretStub).to.have.been.calledOnce;
    // Confirm injected envs were cleaned up from the global scope after the build finishes
    expect(process.env.MY_BUILD_SECRET).to.be.undefined;
    expect(process.env.MY_RUNTIME_SECRET).to.be.undefined;
  });

  it("handles environment variables that do not contain secrets", async () => {
    const bundleConfig = {
      version: "v1" as const,
      runConfig: { runCommand: "npm run build:prod" },
      metadata: {
        adapterPackageName: "@apphosting/angular-adapter",
        adapterVersion: "14.1",
        framework: "nextjs",
      },
      outputFiles: { serverApp: { include: ["./next/standalone"] } },
    };
    sinon.stub(localBuildModule, "localBuild").callsFake(async () => {
      expect(process.env.MY_PLAIN_VAR).to.equal("plain-value");
      expect(process.env.ANOTHER_VAR).to.equal("another-value");
      return bundleConfig;
    });
    const loadSecretStub = sinon.stub(secrets, "loadSecret").resolves("secret-value");

    const envMap = {
      MY_PLAIN_VAR: { value: "plain-value" },
      ANOTHER_VAR: { value: "another-value" },
    };

    await localBuild("test-project", "./", "nextjs", envMap);

    expect(loadSecretStub).to.not.have.been.called;
    // We expect the original process.env to not have these injected globally after run completes,
    // as localBuild cleans up.
    expect(process.env.MY_PLAIN_VAR).to.be.undefined;
    expect(process.env.ANOTHER_VAR).to.be.undefined;
  });
});
