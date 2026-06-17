import * as path from "path";
import * as fs from "fs-extra";
import { expect } from "chai";
import * as sinon from "sinon";
import * as childProcess from "child_process";
import * as apphosting from "../../gcp/apphosting";
import * as projectNumberHelper from "../../getProjectNumber";
import * as secretsManager from "./secrets";
import * as discoverManager from "./discover";
import { Crawler } from "./crawler";
import * as compareManager from "./compare";
import * as poller from "../../operation-poller";
import * as reporterManager from "./reporter";
import * as fetchModule from "node-fetch";
import * as cache from "./cache";
import { runCompareSuite } from "./suite";

describe("runCompareSuite Orchestrator", () => {
  let tempDir: string;
  let execStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let setupSecretsStub: sinon.SinonStub;
  let cleanupSecretsStub: sinon.SinonStub;
  let discoverRoutesStub: sinon.SinonStub;
  let compareRouteResponsesStub: sinon.SinonStub;
  let generateReportStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;
  let crawlStub: sinon.SinonStub;
  let getRoutesStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let saveRecordingStub: sinon.SinonStub;
  let loadRecordingStub: sinon.SinonStub;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "scratch-test-suite-" + Math.random().toString(36).substring(7));
    fs.ensureDirSync(tempDir);

    execStub = sinon.stub(childProcess, "exec").yields(null, { stdout: "success", stderr: "" });
    pollOperationStub = sinon.stub(poller, "pollOperation").resolves();
    getProjectNumberStub = sinon.stub(projectNumberHelper, "getProjectNumber").resolves("12345");
    setupSecretsStub = sinon.stub(secretsManager, "setupSandboxSecrets").resolves([]);
    cleanupSecretsStub = sinon.stub(secretsManager, "cleanupSandboxSecrets").resolves();
    discoverRoutesStub = sinon.stub(discoverManager, "discoverRoutes").resolves(["/"]);
    
    compareRouteResponsesStub = sinon.stub(compareManager, "compareRouteResponses").resolves({
      route: "/",
      statusMatch: true,
      headerMismatches: [],
      expectedHeaderVariations: [],
      bodySimilarity: 1.0,
      bodyDiff: "",
      isBinary: false
    } as any);

    generateReportStub = sinon.stub(reporterManager, "generateReport").resolves();
    getBackendStub = sinon.stub(apphosting, "getBackend").resolves({ uri: "https://my-backend.com" } as any);

    crawlStub = sinon.stub(Crawler.prototype, "crawl").resolves();
    getRoutesStub = sinon.stub(Crawler.prototype, "getRoutes").returns(["/about"]);

    saveRecordingStub = sinon.stub(cache, "saveRecording").resolves();
    loadRecordingStub = sinon.stub(cache, "loadRecording").resolves({
      id: "mock",
      testCaseName: "mock",
      timestamp: "mock",
      url: "mock",
      routes: {}
    });

    fetchStub = sinon.stub(fetchModule, "default").resolves({
      status: 200,
      headers: {
        get: (k: string) => k === "content-type" ? "text/html" : "",
        forEach: (fn: (v: string, k: string) => void) => fn("text/html", "content-type"),
      },
      buffer: async () => Buffer.from("mock body"),
      text: async () => "mock body",
    } as any);
  });

  afterEach(() => {
    sinon.restore();
    fs.removeSync(tempDir);
  });

  it("should coordinate the full deployment, crawling, comparison, and reporting pipeline", async () => {
    const backendIds = ["compare-slot-1-0", "compare-slot-1-1"];
    await runCompareSuite(
      "aryanf-test",
      "us-central1",
      backendIds,
      1,
      "Test-Case-A",
      [
        { path: tempDir },
        { path: tempDir }
      ]
    );

    expect(setupSecretsStub.callCount).to.equal(1);
    expect(execStub.callCount).to.equal(2); // Deploys twice
    expect(discoverRoutesStub.callCount).to.equal(2);
    expect(crawlStub.callCount).to.equal(2);
    
    expect(compareRouteResponsesStub.callCount).to.equal(2); // for "/" and "/about"
    expect(generateReportStub.callCount).to.equal(1);
    expect(cleanupSecretsStub.callCount).to.equal(1);
  });

  it("should support running with local builds enabled", async () => {
    const backendIds = ["compare-slot-1-0", "compare-slot-1-1"];
    await runCompareSuite(
      "aryanf-test",
      "us-central1",
      backendIds,
      1,
      "Test-Case-B",
      [
        { path: tempDir, localBuild: false },
        { path: tempDir, localBuild: true }
      ]
    );

    expect(execStub.callCount).to.equal(2);
    // Verifies one of them was deployed with localBuild experiment prefix
    const firstCallCmd = execStub.firstCall.args[0];
    const secondCallCmd = execStub.secondCall.args[0];
    
    expect(firstCallCmd).to.not.include("FIREBASE_CLI_EXPERIMENTS=apphostinglocalbuilds");
    expect(secondCallCmd).to.include("FIREBASE_CLI_EXPERIMENTS=apphostinglocalbuilds");
  });

  it("should support runtime version patching for backends", async () => {
    const patchStub = sinon.stub(apphosting.client, "patch").resolves({ body: { name: "operation-123" } } as any);
    const backendIds = ["compare-slot-1-0", "compare-slot-1-1"];

    await runCompareSuite(
      "aryanf-test",
      "us-central1",
      backendIds,
      1,
      "Test-Case-C",
      [
        { path: tempDir, runtime: "nodejs20" },
        { path: tempDir, runtime: "nodejs22" }
      ]
    );

    expect(patchStub.callCount).to.equal(2); // Patch both runtimes
    expect(execStub.callCount).to.equal(2);
  });
});
