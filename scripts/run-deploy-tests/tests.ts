import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as cli from "../functions-deploy-tests/cli";
import * as runv2 from "../../src/gcp/runv2";
import { requireAuth } from "../../src/requireAuth";

const PROJECT = process.env.FBTOOLS_TARGET_PROJECT || process.env.GCLOUD_PROJECT || "";
const REGION = "us-central1";
const SERVICE_ID = `run-e2e-${Date.now()}`;

describe("firebase deploy --only run", function (this: Mocha.Suite) {
  this.timeout(600_000);
  let workDir: string;

  function firebase(cmd: string, ...args: string[]): Promise<cli.Result> {
    return cli.exec(cmd, PROJECT, [...args, "--non-interactive"], workDir, false);
  }

  /** Checks that the service responds, and returns the Node.js version it runs on. */
  async function expectServing(): Promise<string> {
    const { uri } = await runv2.getService(PROJECT, REGION, SERVICE_ID);
    const res = await fetch(uri!);
    const body = await res.text();
    expect(body).to.match(/^hello from v\d+\./);
    return body.replace("hello from ", "");
  }

  function writeFirebaseJson(run: Record<string, unknown> = {}): void {
    fs.writeJsonSync(path.join(workDir, "firebase.json"), {
      run: { serviceId: SERVICE_ID, rootDir: "/", region: REGION, ...run },
    });
  }

  before(async () => {
    expect(PROJECT).to.not.be.empty;
    process.env.FIREBASE_CLI_EXPERIMENTS = "directcloudrun";
    await requireAuth({});
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-e2e-"));
    const pkg = { name: "run-e2e", version: "1.0.0" };
    fs.writeJsonSync(path.join(workDir, "package.json"), {
      ...pkg,
      scripts: { start: "node index.js" },
    });
    fs.writeJsonSync(path.join(workDir, "package-lock.json"), {
      ...pkg,
      lockfileVersion: 3,
      packages: { "": pkg },
    });
    fs.writeFileSync(
      path.join(workDir, "index.js"),
      "require('http').createServer((req, res) => res.end('hello from ' + process.version)).listen(process.env.PORT);\n",
    );
    writeFirebaseJson();
  });

  after(async () => {
    await runv2.deleteService(PROJECT, REGION, SERVICE_ID).catch(() => undefined);
    fs.removeSync(workDir);
  });

  it("requires the directcloudrun experiment", async () => {
    delete process.env.FIREBASE_CLI_EXPERIMENTS;
    try {
      const res = await firebase("deploy", "--only", "run");
      expect(res.proc.exitCode).not.to.equal(0);
      expect(res.stdout + res.stderr).to.include("experiment directcloudrun is not enabled");
    } finally {
      process.env.FIREBASE_CLI_EXPERIMENTS = "directcloudrun";
    }
  });

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
    await expectServing();
  });

  it("keeps settings changed outside the CLI on deploy", async () => {
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
    expect(container.resources?.limits?.memory).to.equal("1Gi");
    expect(after.traffic).to.deep.equal([
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
    ]);
    await expectServing();
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
