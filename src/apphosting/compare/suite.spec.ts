import * as path from "path";
import * as fs from "fs-extra";
import { expect } from "chai";
import * as sinon from "sinon";
import * as gcs from "../../gcp/storage";
import * as apphosting from "../../gcp/apphosting";
import * as rolloutHelper from "../rollout";
import * as deployUtil from "../../deploy/apphosting/util";
import * as projectNumberHelper from "../../getProjectNumber";
import * as secretsManager from "./secrets";
import * as slotsManager from "./slots";
import * as discoverManager from "./discover";
import { Crawler } from "./crawler";
import * as compareManager from "./compare";
import * as reporterManager from "./reporter";
import * as lifecycle from "./lifecycle";
import * as localBuildsModule from "../localbuilds";
import { runCompareSuite } from "./suite";

describe("runCompareSuite Orchestrator", () => {
  let tempDir: string;
  let dummyZip: string;

  let upsertBucketStub: sinon.SinonStub;
  let createArchiveStub: sinon.SinonStub;
  let uploadObjectStub: sinon.SinonStub;
  let orchestrateRolloutStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let setupSecretsStub: sinon.SinonStub;
  let cleanupSecretsStub: sinon.SinonStub;
  let acquireSlotStub: sinon.SinonStub;
  let releaseSlotStub: sinon.SinonStub;
  let validateProjectStub: sinon.SinonStub;
  let runGarbageCollectionStub: sinon.SinonStub;
  let discoverRoutesStub: sinon.SinonStub;
  let compareRouteStub: sinon.SinonStub;
  let generateReportStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;
  let crawlStub: sinon.SinonStub;
  let getRoutesStub: sinon.SinonStub;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "scratch-test-suite-" + Math.random().toString(36).substring(7));
    fs.ensureDirSync(tempDir);
    dummyZip = path.join(tempDir, "archive.zip");
    fs.writeFileSync(dummyZip, "empty content");

    upsertBucketStub = sinon.stub(gcs, "upsertBucket").resolves("bucket-123");
    createArchiveStub = sinon.stub(deployUtil, "createSourceDeployArchive").resolves(dummyZip);
    uploadObjectStub = sinon.stub(gcs, "uploadObject").resolves({ bucket: "bucket-123", object: "obj-123", generation: "1" });
    orchestrateRolloutStub = sinon.stub(rolloutHelper, "orchestrateRollout").resolves({} as any);
    getProjectNumberStub = sinon.stub(projectNumberHelper, "getProjectNumber").resolves("12345");
    setupSecretsStub = sinon.stub(secretsManager, "setupSandboxSecrets").resolves([]);
    cleanupSecretsStub = sinon.stub(secretsManager, "cleanupSandboxSecrets").resolves();
    acquireSlotStub = sinon.stub(slotsManager, "acquireComparisonSlot").resolves({ index: 1, backendIdA: "compare-slot-1-a", backendIdB: "compare-slot-1-b" });
    releaseSlotStub = sinon.stub(slotsManager, "releaseComparisonSlot").resolves();
    validateProjectStub = sinon.stub(lifecycle, "validateProject").returns();
    runGarbageCollectionStub = sinon.stub(lifecycle, "runGarbageCollection").resolves();
    discoverRoutesStub = sinon.stub(discoverManager, "discoverRoutes").resolves(["/"]);
    compareRouteStub = sinon.stub(compareManager, "compareRoute").resolves({
      route: "/",
      statusMatch: true,
      headerMismatches: [],
      expectedHeaderVariations: [],
      bodySimilarity: 1.0,
      bodyDiff: "",
      isBinary: false
    });
    generateReportStub = sinon.stub(reporterManager, "generateReport").resolves();
    getBackendStub = sinon.stub(apphosting, "getBackend").resolves({ uri: "https://my-backend.com" } as any);

    crawlStub = sinon.stub(Crawler.prototype, "crawl").resolves();
    getRoutesStub = sinon.stub(Crawler.prototype, "getRoutes").returns(["/about"]);
  });

  afterEach(() => {
    sinon.restore();
    fs.removeSync(tempDir);
  });

  it("should coordinate the full deployment, crawling, comparison, and reporting pipeline", async () => {
    await runCompareSuite(
      "aryanf-test",
      "us-central1",
      "/app/path-a",
      "/app/path-b"
    );

    expect(acquireSlotStub.callCount).to.equal(1);
    expect(setupSecretsStub.callCount).to.equal(1);
    expect(upsertBucketStub.callCount).to.equal(1);
    expect(createArchiveStub.callCount).to.equal(2);
    expect(uploadObjectStub.callCount).to.equal(2);
    expect(orchestrateRolloutStub.callCount).to.equal(2);
    expect(discoverRoutesStub.callCount).to.equal(1);
    expect(crawlStub.callCount).to.equal(1);
    
    expect(compareRouteStub.callCount).to.equal(2);
    expect(compareRouteStub.firstCall.args[0]).to.equal("/");
    expect(compareRouteStub.secondCall.args[0]).to.equal("/about");

    expect(generateReportStub.callCount).to.equal(1);
    expect(cleanupSecretsStub.callCount).to.equal(1);
    expect(releaseSlotStub.callCount).to.equal(1);
  });

  it("should support running with local builds enabled for one of the backends", async () => {
    const localBuildStub = sinon.stub(localBuildsModule, "localBuild").resolves({
      outputFiles: ["index.html"],
      buildConfig: { runCommand: "npm run start" }
    });

    const createTarStub = sinon.stub(deployUtil, "createLocalBuildTarArchive").resolves(dummyZip);

    await runCompareSuite(
      "aryanf-test",
      "us-central1",
      "/app/path-a",
      "/app/path-b",
      { localBuildA: false, localBuildB: true }
    );

    // Backend A is source deploy -> calls createSourceDeployArchive (1 time)
    // Backend B is local build -> calls localBuild (1 time) and createLocalBuildTarArchive (1 time)
    expect(createArchiveStub.callCount).to.equal(1);
    expect(localBuildStub.callCount).to.equal(1);
    expect(createTarStub.callCount).to.equal(1);

    expect(uploadObjectStub.callCount).to.equal(2);
    expect(orchestrateRolloutStub.callCount).to.equal(2);
  });
});
