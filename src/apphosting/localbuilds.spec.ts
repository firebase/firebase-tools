import * as sinon from "sinon";
import { expect } from "chai";
import * as localBuildModule from "@apphosting/build";
import { localBuild, runUniversalMaker } from "./localbuilds";
import * as secrets from "./secrets/index";
import { EnvMap } from "./yaml";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as experiments from "../experiments";
import * as universalMakerDownload from "./universalMakerDownload";

describe("localBuild", () => {
  beforeEach(() => {
    sinon.stub(experiments, "isEnabled").returns(false);
  });
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

    const envMap: EnvMap = {
      MY_BUILD_SECRET: { secret: "my-secret-id", availability: ["BUILD"] },
      MY_RUNTIME_SECRET: { secret: "runtime-only-id", availability: ["RUNTIME"] },
      MY_PLAIN_VAR: { value: "plain-value" },
    };

    await localBuild("test-project", "./", "nextjs", envMap, {
      nonInteractive: true,
      allowLocalBuildSecrets: true,
    });

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

    const envMap: EnvMap = {
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

  describe("localBuild secret confirmations", () => {
    let confirmStub: sinon.SinonStub;

    beforeEach(() => {
      confirmStub = sinon.stub(require("../prompt"), "confirm");
    });

    it("throws an error in non-interactive mode if build-available secrets are used without the bypass flag", async () => {
      const envMap: EnvMap = {
        MY_BUILD_SECRET: { secret: "my-secret-id", availability: ["BUILD"] },
      };

      await expect(
        localBuild("test-project", "./", "nextjs", envMap, { nonInteractive: true }),
      ).to.be.rejectedWith(
        "Using build-available secrets during a local build in non-interactive mode requires the --allow-local-build-secrets flag.",
      );
    });

    it("allows build-available secrets in non-interactive mode if bypass flag is provided", async () => {
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
      sinon.stub(localBuildModule, "localBuild").resolves(bundleConfig);
      sinon.stub(secrets, "loadSecret").resolves("secret-value");

      const envMap: EnvMap = {
        MY_BUILD_SECRET: { secret: "my-secret-id", availability: ["BUILD"] },
      };

      await localBuild("test-project", "./", "nextjs", envMap, {
        nonInteractive: true,
        allowLocalBuildSecrets: true,
      });

      expect(confirmStub).to.not.have.been.called;
    });

    it("cancels the build if the user declines the secrets confirmation prompt", async () => {
      confirmStub.resolves(false);

      const envMap: EnvMap = {
        MY_BUILD_SECRET: { secret: "my-secret-id", availability: ["BUILD"] },
      };

      await expect(
        localBuild("test-project", "./", "nextjs", envMap, { nonInteractive: false }),
      ).to.be.rejectedWith("Cancelled local build due to BUILD-available secrets.");
      expect(confirmStub).to.have.been.calledOnce;
    });

    it("proceeds with the build if the user accepts the secrets confirmation prompt", async () => {
      confirmStub.resolves(true);
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
      sinon.stub(localBuildModule, "localBuild").resolves(bundleConfig);
      sinon.stub(secrets, "loadSecret").resolves("secret-value");

      const envMap: EnvMap = {
        MY_BUILD_SECRET: { secret: "my-secret-id", availability: ["BUILD"] },
      };

      await localBuild("test-project", "./", "nextjs", envMap, { nonInteractive: false });
      expect(confirmStub).to.have.been.calledOnce;
    });
  });

  describe("runUniversalMaker", () => {
    let downloadStub: sinon.SinonStub;
    let readFileSyncStub: sinon.SinonStub;

    beforeEach(() => {
      downloadStub = sinon
        .stub(universalMakerDownload, "getOrDownloadUniversalMaker")
        .resolves("/path/to/universal_maker");
      readFileSyncStub = sinon.stub(fs, "readFileSync").callsFake((pathStr: any) => {
        if (typeof pathStr === "string" && pathStr.endsWith("bundle.yaml")) {
          return `
            runConfig:
              runCommand: npm run start
            outputFiles:
              serverApp:
                include:
                  - .next/standalone
          `;
        }
        if (typeof pathStr === "string" && pathStr.endsWith("build_output.json")) {
          return JSON.stringify({
            command: "npm",
            args: ["run", "start"],
            language: "nodejs",
            runtime: "nodejs22",
            envVars: {
              PORT: "3000",
            },
          });
        }
        return "";
      });
    });

    it("should successfully execute Universal Maker and parse output", async () => {
      const spawnStub = sinon.stub(childProcess, "spawnSync").returns({
        status: 0,
        output: ["", "mock output", ""],
        pid: 12345,
        stdout: "mock stdout",
        stderr: "mock stderr",
        signal: null,
      });

      sinon.stub(fs, "existsSync").returns(true);
      sinon.stub(fs, "mkdirSync");
      sinon.stub(fs, "readdirSync").returns(["bundle.yaml"] as any);
      sinon.stub(fs, "renameSync");
      sinon.stub(fs, "rmSync");
      sinon.stub(fs, "rmdirSync");
      sinon.stub(fs, "unlinkSync");
      const output = await runUniversalMaker("./", "nextjs");

      expect(output).to.deep.equal({
        metadata: {
          language: "nodejs",
          runtime: "nodejs22",
          framework: "nextjs",
        },
        runConfig: {
          runCommand: "npm run start",
          environmentVariables: [{ variable: "PORT", value: "3000", availability: ["RUNTIME"] }],
        },
        outputFiles: {
          serverApp: {
            include: [".next/standalone"],
          },
        },
      });

      sinon.assert.calledOnce(spawnStub);
      sinon.assert.calledWith(
        spawnStub,
        "/path/to/universal_maker",
        ["-application_dir", "./", "-output_dir", "./", "-output_format", "json"],
        sinon.match({
          env: sinon.match({
            X_GOOGLE_TARGET_PLATFORM: "fah",
          }),
        }),
      );
      sinon.assert.calledTwice(readFileSyncStub);
      sinon.assert.calledOnce(downloadStub);
    });

    it("should raise clear FirebaseError on permission errors within child execution", async () => {
      sinon.stub(childProcess, "spawnSync").callsFake(() => {
        const err = new Error("EACCES exception") as NodeJS.ErrnoException;
        err.code = "EACCES";

        throw err;
      });

      await expect(runUniversalMaker("./")).to.be.rejectedWith(
        "Failed to execute the Universal Maker binary due to permission constraints. Please assure you have set chmod +x on your file.",
      );
      sinon.assert.calledOnce(downloadStub);
    });
  });
});
