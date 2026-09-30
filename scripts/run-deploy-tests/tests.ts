import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as cli from "../functions-deploy-tests/cli";
import * as runv2 from "../../src/gcp/runv2";
import * as secretManager from "../../src/gcp/secretManager";
import { BUILD_ENV_ANNOTATION } from "../../src/deploy/run/buildEnv";
import { FIREBASE_APP_ANNOTATION } from "../../src/deploy/run/util";
import { AppPlatform, createWebApp, listFirebaseApps } from "../../src/management/apps";
import { requireAuth } from "../../src/requireAuth";

const PROJECT = process.env.FBTOOLS_TARGET_PROJECT || process.env.GCLOUD_PROJECT || "";
const REGION = "us-central1";
const SERVICE_ID = `run-e2e-${Date.now()}`;
const SECRET_ID = SERVICE_ID;
const SECRET_VALUE = `secret-${Date.now()}`;

describe("firebase deploy --only run", function (this: Mocha.Suite) {
  this.timeout(600_000);
  let workDir: string;

  function firebase(cmd: string, ...args: string[]): Promise<cli.Result> {
    return cli.exec(cmd, PROJECT, [...args, "--non-interactive"], workDir, false);
  }

  async function mainContainer(): Promise<runv2.Container> {
    const service = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    return service.template.containers![0];
  }

  /** Checks that the service responds, and returns the Node.js version it runs on. */
  async function expectServing(): Promise<string> {
    const { uri } = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const res = await fetch(uri!);
    const body = await res.text();
    expect(body).to.match(/^hello from v\d+\./);
    return body.replace("hello from ", "");
  }

  /** Returns the value of BUILD_VALUE that the service's last build saw. */
  async function builtValue(): Promise<string> {
    const { uri } = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    return (await fetch(`${uri!}/build`)).text();
  }

  /** Sets the service's build env annotation, keeping its other annotations. */
  async function setBuildEnv(env: Record<string, unknown>): Promise<void> {
    const service = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    await runv2.updateService(
      {
        name: service.name,
        annotations: { ...service.annotations, [BUILD_ENV_ANNOTATION]: JSON.stringify(env) },
      } as unknown as runv2.Service,
      { updateMask: ["annotations"] },
    );
  }

  function writeFirebaseJson(run: Record<string, unknown> = {}): void {
    fs.writeJsonSync(path.join(workDir, "firebase.json"), {
      run: { serviceId: SERVICE_ID, rootDir: "/", region: REGION, ...run },
    });
  }

  before(async () => {
    expect(PROJECT).to.not.be.empty;
    process.env.FIREBASE_CLI_EXPERIMENTS = "direct_cloud_run";
    await requireAuth({});
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-e2e-"));
    const pkg = { name: "run-e2e", version: "1.0.0" };
    fs.writeJsonSync(path.join(workDir, "package.json"), {
      ...pkg,
      scripts: {
        start: "node index.js",
        build: `node -e "require('fs').writeFileSync('build.txt', process.env.BUILD_VALUE || '')"`,
      },
    });
    fs.writeJsonSync(path.join(workDir, "package-lock.json"), {
      ...pkg,
      lockfileVersion: 3,
      packages: { "": pkg },
    });
    fs.writeFileSync(
      path.join(workDir, "index.js"),
      [
        'const fs = require("fs");',
        "require('http').createServer((req, res) => res.end(req.url === '/build'",
        "  ? (fs.existsSync('build.txt') ? fs.readFileSync('build.txt', 'utf8') : 'not built')",
        "  : 'hello from ' + process.version)).listen(process.env.PORT);",
      ].join("\n"),
    );
    writeFirebaseJson();
    await secretManager.createSecret(PROJECT, SECRET_ID, {});
    await secretManager.addVersion(PROJECT, SECRET_ID, SECRET_VALUE);
  });

  after(async () => {
    await runv2.deleteService(PROJECT, REGION, SERVICE_ID).catch(() => undefined);
    await secretManager.deleteSecret(PROJECT, SECRET_ID).catch(() => undefined);
    fs.removeSync(workDir);
  });

  it("requires the direct_cloud_run experiment", async () => {
    delete process.env.FIREBASE_CLI_EXPERIMENTS;
    try {
      const res = await firebase("deploy", "--only", "run");
      expect(res.proc.exitCode).not.to.equal(0);
      expect(res.stdout + res.stderr).to.include("experiment direct_cloud_run is not enabled");
    } finally {
      process.env.FIREBASE_CLI_EXPERIMENTS = "direct_cloud_run";
    }
  });

  let defaultNodeVersion: string;

  it("creates a service from source", async () => {
    const res = await firebase("deploy", "--only", "run");
    expect(res.proc.exitCode).to.equal(0);
    expect(res.stdout).to.include("Deploy complete!");

    const service = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const container = service.template.containers![0];
    expect(container.baseImageUri).to.be.undefined;
    expect(service.traffic).to.deep.equal([
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
    ]);
    defaultNodeVersion = await expectServing();
    expect(await builtValue()).to.equal("");
  });

  /**
   * Runs run:services:update and checks that it rebuilt and deployed the service like deploy
   * does. Returns the new main container and the Node.js version the service now runs on.
   */
  async function expectUpdated(
    ...args: string[]
  ): Promise<{ container: runv2.Container; nodeVersion: string }> {
    const before = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const res = await firebase("run:services:update", SERVICE_ID, ...args);
    expect(res.proc.exitCode).to.equal(0);
    expect(res.stdout).to.include("Deploy complete!");

    const after = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const container = after.template.containers![0];
    const oldContainer = before.template.containers![0];
    // Cloud Build deploys push a new image; local builds upload new source.
    expect([container.image, container.sourceCode]).not.to.deep.equal([
      oldContainer.image,
      oldContainer.sourceCode,
    ]);
    expect(after.traffic).to.deep.equal([
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
    ]);
    return { container, nodeVersion: await expectServing() };
  }

  it("sets a base image, then rebuilds and deploys", async () => {
    const { container, nodeVersion } = await expectUpdated("--base-image", "nodejs22");
    expect(container.baseImageUri).to.include("nodejs22");
    expect(nodeVersion).to.match(/^v22\./);
  });

  it("keeps the base image and settings changed outside the CLI on deploy", async () => {
    // Simulate a console change to a service-level setting.
    const service = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const template = { ...service.template, revision: undefined };
    template.containers![0].resources = { limits: { cpu: "1", memory: "1Gi" } };
    await runv2.updateService({ name: service.name, template }, { updateMask: ["template"] });

    const res = await firebase("deploy", "--only", `run:${SERVICE_ID}`);
    expect(res.proc.exitCode).to.equal(0);
    const after = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const container = after.template.containers![0];
    expect(container.image).not.to.equal(service.template.containers![0].image);
    expect(container.baseImageUri).to.include("nodejs22");
    expect(container.resources?.limits?.memory).to.equal("1Gi");
    expect(after.traffic).to.deep.equal([
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
    ]);
    expect(await expectServing()).to.match(/^v22\./);
  });

  it("changes the base image", async () => {
    const { container, nodeVersion } = await expectUpdated("--base-image", "nodejs20");
    expect(container.baseImageUri).to.include("nodejs20");
    expect(nodeVersion).to.match(/^v20\./);
  });

  it("clears the base image", async () => {
    const { container, nodeVersion } = await expectUpdated("--clear-base-image");
    expect(container).not.to.have.property("baseImageUri");
    expect(container.resources?.limits?.memory).to.equal("1Gi");
    expect(nodeVersion.split(".")[0]).to.equal(defaultNodeVersion.split(".")[0]);
  });

  it("passes build env from the service to Cloud Build", async () => {
    await setBuildEnv({ BUILD_VALUE: "plain" });
    const res = await firebase("deploy", "--only", "run");
    expect(res.proc.exitCode).to.equal(0);
    expect(res.stdout).to.include(`Using build environment variables from ${BUILD_ENV_ANNOTATION}`);
    expect(await builtValue()).to.equal("plain");
    // Deploys don't touch service-level annotations.
    const service = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    expect(service.annotations?.[BUILD_ENV_ANNOTATION]).to.equal('{"BUILD_VALUE":"plain"}');
  });

  it("rejects build secrets on Cloud Build", async () => {
    await setBuildEnv({ BUILD_VALUE: { secret: SECRET_ID, version: "1" } });
    const res = await firebase("deploy", "--only", "run");
    expect(res.proc.exitCode).not.to.equal(0);
    expect(res.stdout + res.stderr).to.include("has build secrets (BUILD_VALUE)");
  });

  it("requires a setting to update", async () => {
    const res = await firebase("run:services:update", SERVICE_ID);
    expect(res.proc.exitCode).not.to.equal(0);
    expect(res.stdout + res.stderr).to.include("Specify a setting to update:");
  });

  it("requires a base image for local builds", async () => {
    writeFirebaseJson({ localBuild: true });
    const failed = await firebase("deploy", "--only", "run");
    expect(failed.proc.exitCode).not.to.equal(0);
    expect(failed.stdout + failed.stderr).to.include("Local builds require a base image");
  });

  it("sets the base image of a local build, then builds locally with secrets and deploys", async () => {
    const { container, nodeVersion } = await expectUpdated("--base-image", "nodejs22");
    expect(container.image).to.equal("scratch");
    expect(container.sourceCode).to.exist;
    expect(container.baseImageUri).to.include("nodejs22");
    expect(container.resources?.limits?.memory).to.equal("1Gi");
    expect(nodeVersion).to.match(/^v22\./);
    expect(await builtValue()).to.equal(SECRET_VALUE);

    const res = await firebase("deploy", "--only", "run");
    expect(res.proc.exitCode).to.equal(0);
    expect((await mainContainer()).baseImageUri).to.include("nodejs22");
    expect(await expectServing()).to.match(/^v22\./);
  });

  it("links and clears a Firebase Web App", async () => {
    const apps = await listFirebaseApps(PROJECT, AppPlatform.WEB);
    const appId =
      apps[0]?.appId ?? (await createWebApp(PROJECT, { displayName: SERVICE_ID })).appId;

    const { container } = await expectUpdated("--app", appId);
    const linked = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    expect(linked.annotations?.[FIREBASE_APP_ANNOTATION]).to.equal(appId);
    expect(container.env?.find((e) => e.name === "FIREBASE_CONFIG")?.value).to.include(PROJECT);

    const { container: clearedContainer } = await expectUpdated("--clear-app");
    const cleared = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    expect(cleared.annotations?.[FIREBASE_APP_ANNOTATION]).to.be.undefined;
    expect(clearedContainer.env?.find((e) => e.name === "FIREBASE_CONFIG")).to.be.undefined;
  });

  it("rejects services that aren't in firebase.json", async () => {
    const res = await firebase("deploy", "--only", "run:not-a-service");
    expect(res.proc.exitCode).not.to.equal(0);
    expect(res.stdout + res.stderr).to.include("not-a-service not detected in firebase.json");
  });

  it("fails without a firebase.json", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-e2e-empty-"));
    try {
      const res = await cli.exec(
        "deploy",
        PROJECT,
        ["--only", "run", "--non-interactive"],
        emptyDir,
      );
      expect(res.proc.exitCode).not.to.equal(0);
      expect(res.stdout + res.stderr).to.include("Not in a Firebase app directory");
    } finally {
      fs.removeSync(emptyDir);
    }
  });

  it("fails with a project that doesn't exist", async () => {
    const res = await cli.exec(
      "deploy",
      "invalid-project-id-1234567890",
      ["--only", "run", "--non-interactive"],
      workDir,
    );
    expect(res.proc.exitCode).not.to.equal(0);
  });
});
