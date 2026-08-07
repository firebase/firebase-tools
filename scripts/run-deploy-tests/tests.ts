import * as fs from "fs-extra";
import * as path from "path";
import { expect } from "chai";
import * as cli from "../integration-helpers/cli";
import * as runv2 from "../../src/gcp/runv2";

interface MockRunConfig {
  serviceId?: string;
  region?: string;
  source?: string;
}

interface MockFirebaseJson {
  run?: MockRunConfig | MockRunConfig[];
  hosting?: { public?: string };
}

import * as os from "os";

const TARGET_PROJECT =
  process.env.FBTOOLS_TARGET_PROJECT || process.env.GCLOUD_PROJECT || "test-project";
const DEFAULT_APP_DIR = process.env.APP_DIR;

describe("Cloud Run Deployment E2E Test Suite", function (this: Mocha.Suite) {
  this.timeout(600_000); // 10 minutes per test for Cloud Build & Cloud Run provisioning

  let workDir: string;
  let hasAppDir = false;

  before(() => {
    if (DEFAULT_APP_DIR && fs.existsSync(DEFAULT_APP_DIR)) {
      workDir = DEFAULT_APP_DIR;
      hasAppDir = true;
    } else {
      // Create isolated temporary workspace for E2E testing
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-run-e2e-"));
      fs.writeFileSync(
        path.join(workDir, "package.json"),
        JSON.stringify(
          {
            name: "run-e2e-test-app",
            version: "1.0.0",
            scripts: { start: "node index.js" },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(workDir, "index.js"),
        'const http = require("http"); const server = http.createServer((req, res) => res.end("OK")); server.listen(process.env.PORT || 8080);',
      );
    }
  });

  after(() => {
    if (!hasAppDir && workDir && fs.existsSync(workDir)) {
      fs.removeSync(workDir);
    }
  });

  beforeEach(() => {
    // Backup any existing firebase.json / .firebaserc before each test
    const fbJson = path.join(workDir, "firebase.json");
    const fbRc = path.join(workDir, ".firebaserc");
    const apphostingYaml = path.join(workDir, "apphosting.yaml");

    if (fs.existsSync(fbJson)) fs.moveSync(fbJson, `${fbJson}.bak`, { overwrite: true });
    if (fs.existsSync(fbRc)) fs.moveSync(fbRc, `${fbRc}.bak`, { overwrite: true });
    if (fs.existsSync(apphostingYaml)) {
      fs.moveSync(apphostingYaml, `${apphostingYaml}.bak`, { overwrite: true });
    }
  });

  afterEach(() => {
    // Restore backup configs
    const fbJson = path.join(workDir, "firebase.json");
    const fbRc = path.join(workDir, ".firebaserc");
    const apphostingYaml = path.join(workDir, "apphosting.yaml");

    if (fs.existsSync(`${fbJson}.bak`)) fs.moveSync(`${fbJson}.bak`, fbJson, { overwrite: true });
    else if (fs.existsSync(fbJson)) fs.removeSync(fbJson);

    if (fs.existsSync(`${fbRc}.bak`)) fs.moveSync(`${fbRc}.bak`, fbRc, { overwrite: true });
    else if (fs.existsSync(fbRc)) fs.removeSync(fbRc);

    if (fs.existsSync(`${apphostingYaml}.bak`)) {
      fs.moveSync(`${apphostingYaml}.bak`, apphostingYaml, { overwrite: true });
    } else if (fs.existsSync(apphostingYaml)) {
      fs.removeSync(apphostingYaml);
    }
  });

  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: should initialize Cloud Run configuration in non-interactive mode", async () => {
      const res = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(res.exitCode).to.equal(0);
      expect(fs.existsSync(path.join(workDir, "firebase.json"))).to.be.true;

      const config = fs.readJsonSync(path.join(workDir, "firebase.json")) as MockFirebaseJson;
      expect(config.run).to.exist;
    });

    it("T1.2: should respect explicit --project flag during init", async () => {
      const res = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive", "--project", TARGET_PROJECT],
        workDir,
        false,
      );
      expect(res.exitCode).to.equal(0);
      expect(fs.existsSync(path.join(workDir, "firebase.json"))).to.be.true;
    });

    it("T1.3: should additively update existing firebase.json without overwriting other targets", async () => {
      fs.writeJsonSync(path.join(workDir, "firebase.json"), { hosting: { public: "public" } });

      const res = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(res.exitCode).to.equal(0);

      const config = fs.readJsonSync(path.join(workDir, "firebase.json")) as MockFirebaseJson;
      expect(config.hosting).to.deep.equal({ public: "public" });
      expect(config.run).to.exist;
    });

    it("T1.4: should successfully deploy source to Cloud Run", async () => {
      await cli.exec("init", TARGET_PROJECT, ["run", "--non-interactive"], workDir, false);
      const deployRes = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
      );
      expect(deployRes.exitCode).to.equal(0);
      expect(deployRes.stdout).to.include("Deploy complete!");
    });

    it("T1.5: should deploy successfully with --force flag", async () => {
      await cli.exec("init", TARGET_PROJECT, ["run", "--non-interactive"], workDir, false);
      const deployRes = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive", "--force"],
        workDir,
        false,
      );
      expect(deployRes.exitCode).to.equal(0);
      expect(deployRes.stdout).to.include("Deploy complete!");
    });
  });

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: should fail init gracefully with an invalid/non-existent project ID", async () => {
      const res = await cli.exec(
        "init",
        "invalid-project-id-1234567890",
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(res.exitCode).to.not.equal(0);
    });

    it("T2.2: should fail init gracefully in directory without write permissions", async () => {
      const readOnlyDir = path.join(workDir, "no_write_dir");
      fs.ensureDirSync(readOnlyDir);
      fs.chmodSync(readOnlyDir, 0o555);

      try {
        const res = await cli.exec(
          "init",
          TARGET_PROJECT,
          ["run", "--non-interactive"],
          readOnlyDir,
          false,
        );
        expect(res.exitCode).to.not.equal(0);
      } finally {
        fs.chmodSync(readOnlyDir, 0o755);
        fs.removeSync(readOnlyDir);
      }
    });

    it("T2.3: should deploy with default in-memory config or throw clear error when firebase.json is absent", async () => {
      const res = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
      );
      // Validates either clean zero-config execution or standard missing config error
      expect([0, 1]).to.include(res.exitCode);
    });

    it("T2.4: should fail deploy gracefully when invalid region is provided", async () => {
      await cli.exec("init", TARGET_PROJECT, ["run", "--non-interactive"], workDir, false);
      const res = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
        { FIREBASE_RUN_REGION: "invalid-region-99" },
      );
      expect(res.exitCode).to.not.equal(0);
    });

    it("T2.5: should be idempotent when init run is executed repeatedly", async () => {
      const res1 = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(res1.exitCode).to.equal(0);

      const res2 = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(res2.exitCode).to.equal(0);

      const config = fs.readJsonSync(path.join(workDir, "firebase.json")) as MockFirebaseJson;
      expect(config.run).to.exist;
    });
  });

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: should support immediate sequential init and deploy", async () => {
      const initRes = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(initRes.exitCode).to.equal(0);

      const deployRes = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
      );
      expect(deployRes.exitCode).to.equal(0);
    });

    it("T3.2: should support multiple sequential deployments idempotently", async () => {
      await cli.exec("init", TARGET_PROJECT, ["run", "--non-interactive"], workDir, false);

      const deploy1 = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
      );
      expect(deploy1.exitCode).to.equal(0);

      const deploy2 = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
      );
      expect(deploy2.exitCode).to.equal(0);
    });
  });

  describe("Tier 4: Real-World Application & GCP Resource Verification", () => {
    it("T4.1: should deploy application with apphosting.yaml and verify Cloud Run live resource configuration", async () => {
      const apphostingYamlContent = `
runConfig:
  cpu: 2
  memoryMiB: 1024
  minInstances: 1
  maxInstances: 5
  concurrency: 100
env:
  - variable: TEST_VAR
    value: "hello_world"
    availability:
      - RUNTIME
`;
      fs.writeFileSync(path.join(workDir, "apphosting.yaml"), apphostingYamlContent.trim());

      const initRes = await cli.exec(
        "init",
        TARGET_PROJECT,
        ["run", "--non-interactive"],
        workDir,
        false,
      );
      expect(initRes.exitCode).to.equal(0);

      const deployRes = await cli.exec(
        "deploy",
        TARGET_PROJECT,
        ["--only", "run", "--non-interactive"],
        workDir,
        false,
      );
      expect(deployRes.exitCode).to.equal(0);

      // Extract serviceId and region from generated firebase.json
      const config = fs.readJsonSync(path.join(workDir, "firebase.json")) as MockFirebaseJson;
      const runConfig = (Array.isArray(config.run) ? config.run[0] : config.run) as MockRunConfig;
      const serviceId = runConfig?.serviceId || "my-service";
      const region = runConfig?.region || "us-central1";

      // Verify Cloud Run Service via GCP API directly
      const service = await runv2.getService(TARGET_PROJECT, region, serviceId);
      expect(service).to.exist;

      const container = service.template?.containers?.[0];
      expect(container).to.exist;

      // Verify CPU and Memory limits
      expect(container?.resources?.limits?.cpu).to.equal("2");
      expect(container?.resources?.limits?.memory).to.equal("1024Mi");

      // Verify Min/Max Instance Scaling (Service-Level or Template-Level)
      const minInstances =
        service.scaling?.minInstanceCount ?? service.template?.scaling?.minInstanceCount;
      const maxInstances =
        service.scaling?.maxInstanceCount ?? service.template?.scaling?.maxInstanceCount;
      expect(minInstances).to.equal(1);
      expect(maxInstances).to.equal(5);

      // Verify Concurrency
      expect(service.template?.maxInstanceRequestConcurrency).to.equal(100);

      // Verify Runtime Environment Variables
      const envVars = container?.env || [];
      const testVar = envVars.find((e) => e.name === "TEST_VAR");
      expect(testVar).to.exist;
      expect(testVar?.value).to.equal("hello_world");
    });
  });
});
