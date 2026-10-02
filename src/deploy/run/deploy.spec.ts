import { expect } from "chai";
import * as fs from "fs";
import * as sinon from "sinon";
import * as localbuilds from "../../apphosting/localbuilds";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import * as getProjectNumber from "../../getProjectNumber";
import { Options } from "../../options";
import * as apphostingPrepare from "../apphosting/prepare";
import * as apphostingUtil from "../apphosting/util";
import { ServiceDeploy } from "./args";
import { deploy } from "./deploy";

describe("run deploy", () => {
  const options = { config: { projectDir: "/p" } } as unknown as Options;
  const config = { serviceId: "s", region: "us-central1", rootDir: "web" };
  let sourceArchiveStub: sinon.SinonStub;
  let tarArchiveStub: sinon.SinonStub;
  let rmSyncStub: sinon.SinonSpy;
  let submitBuildStub: sinon.SinonStub;
  let createServiceStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;

  function service(overrides: Partial<ServiceDeploy> = {}): ServiceDeploy {
    return { config, ...overrides };
  }

  async function deployOne(svc: ServiceDeploy, opts = options): Promise<ServiceDeploy> {
    await deploy({ projectId: "p" }, opts, { run: { services: [svc] } });
    return svc;
  }

  beforeEach(() => {
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("123");
    sinon.stub(gcs, "upsertBucket").resolves("bucket");
    sinon
      .stub(gcs, "uploadObject")
      .callsFake((src) => Promise.resolve({ bucket: "bucket", object: src.file, generation: "1" }));
    sinon.stub(fs, "createReadStream").returns("stream" as unknown as fs.ReadStream);
    rmSyncStub = sinon.spy(fs, "rmSync");
    sourceArchiveStub = sinon.stub(apphostingUtil, "createSourceDeployArchive").resolves("src.zip");
    tarArchiveStub = sinon
      .stub(apphostingUtil, "createLocalBuildTarArchive")
      .resolves("out.tar.gz");
    sinon.stub(artifactregistry, "ensureDockerRepository").resolves();
    submitBuildStub = sinon.stub(runv2, "submitBuild").resolves();
    createServiceStub = sinon
      .stub(runv2, "createService")
      .resolves({ uri: "new" } as runv2.Service);
    updateServiceStub = sinon.stub(runv2, "updateService").resolves({ uri: "up" } as runv2.Service);
    sinon.stub(Date, "now").returns(42);
  });

  afterEach(() => sinon.restore());

  it("builds source and creates a new service", async () => {
    const svc = await deployOne(service({ baseImage: "nodejs22" }), {
      ...options,
      message: "hi",
    } as Options);

    expect(sourceArchiveStub).to.have.been.calledWithMatch({ backendId: "s" }, "/p/web");
    expect(rmSyncStub).to.have.been.calledWith("src.zip", { force: true });
    const imageUri = "us-central1-docker.pkg.dev/p/cloud-run-source-deploy/s:42";
    expect(submitBuildStub).to.have.been.calledWith("p", "us-central1", {
      storageSource: { bucket: "bucket", object: "src.zip" },
      imageUri,
      buildpackBuild: {
        baseImage: "nodejs22",
        enableAutomaticUpdates: true,
        environmentVariables: {
          X_GOOGLE_TARGET_PLATFORM: "fah",
          FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
        },
      },
    });
    expect(createServiceStub).to.have.been.calledWith("p", "us-central1", "s", {
      name: "projects/p/locations/us-central1/services/s",
      template: {
        containers: [
          {
            name: "s",
            image: imageUri,
            baseImageUri: "nodejs22",
          },
        ],
        annotations: { "firebase.google.com/deploy-message": "hi" },
      },
      client: "cli-firebase",
      invokerIamDisabled: true,
      ingress: "INGRESS_TRAFFIC_ALL",
    });
    expect(svc.deployed).to.deep.equal({ uri: "new" });
  });

  it("builds without a base image", async () => {
    await deployOne(service());
    expect(submitBuildStub.firstCall.args[2].buildpackBuild).to.deep.equal({
      environmentVariables: {
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    });
    expect(createServiceStub.firstCall.args[3].template.containers[0]).not.to.have.property(
      "baseImageUri",
    );
  });

  it("passes build env to the build", async () => {
    await deployOne(service({ baseImage: "nodejs22", buildEnv: { A: "1" } }));
    expect(submitBuildStub.firstCall.args[2].buildpackBuild).to.deep.equal({
      baseImage: "nodejs22",
      enableAutomaticUpdates: true,
      environmentVariables: {
        A: "1",
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    });
  });

  it("updates the live revision template of an existing service", async () => {
    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      template: {
        revision: "s-1",
        serviceAccount: "sa",
        annotations: { "firebase.google.com/deploy-message": "old", keep: "me" },
        containers: [
          {
            name: "main",
            image: "old",
            ports: [{ containerPort: 8080 }],
            baseImageUri: "old-base",
            env: [
              { name: "B", value: "old" },
              { name: "C", value: "c" },
            ],
          },
        ],
      },
      trafficStatuses: [
        { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", revision: "s-1", percent: 100 },
      ],
    } as unknown as runv2.Service;

    await deployOne(service({ existing }));

    const [update, updateOpts] = updateServiceStub.firstCall.args;
    expect(updateOpts.updateMask).to.deep.equal(["template", "traffic"]);
    expect(update.template).to.deep.equal({
      serviceAccount: "sa",
      annotations: { keep: "me" },
      containers: [
        {
          name: "main",
          image: "us-central1-docker.pkg.dev/p/cloud-run-source-deploy/s:42",
          ports: [{ containerPort: 8080 }],
          env: [
            { name: "B", value: "old" },
            { name: "C", value: "c" },
          ],
        },
      ],
    });
    expect(update.traffic).to.deep.equal([
      { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
    ]);
    expect(existing.template.revision).to.equal("s-1");
  });

  it("sets and clears the linked Firebase Web App and runtime FIREBASE_CONFIG", async () => {
    await deployOne(service({ appId: "new-app", firebaseConfig: '{"projectId":"p"}' }));
    expect(createServiceStub.firstCall.args[3].annotations).to.deep.equal({
      "firebase.google.com/app-id": "new-app",
    });
    expect(createServiceStub.firstCall.args[3].template.containers[0].env).to.deep.equal([
      { name: "FIREBASE_CONFIG", value: '{"projectId":"p"}' },
    ]);

    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      annotations: { keep: "1", "firebase.google.com/app-id": "old-app" },
      template: {
        containers: [
          {
            name: "s",
            image: "old",
            env: [{ name: "FIREBASE_CONFIG", value: '{"projectId":"old"}' }],
          },
        ],
      },
    } as unknown as runv2.Service;

    await deployOne(service({ existing, appId: "new-app", firebaseConfig: '{"projectId":"p"}' }));
    expect(updateServiceStub.firstCall.args[0].annotations).to.deep.equal({
      keep: "1",
      "firebase.google.com/app-id": "new-app",
    });
    expect(updateServiceStub.firstCall.args[1].updateMask).to.deep.equal([
      "annotations",
      "template",
      "traffic",
    ]);
    expect(updateServiceStub.firstCall.args[0].template.containers[0].env).to.deep.equal([
      { name: "FIREBASE_CONFIG", value: '{"projectId":"p"}' },
    ]);

    await deploy({ projectId: "p", appId: null }, options, {
      run: { services: [service({ existing })] },
    });
    expect(updateServiceStub.secondCall.args[0].annotations).to.deep.equal({ keep: "1" });
    expect(updateServiceStub.secondCall.args[0].template.containers[0]).not.to.have.property("env");
  });

  describe("local builds", () => {
    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      template: { containers: [{ name: "s", image: "old" }] },
    } as unknown as runv2.Service;
    const localService = (overrides: Partial<ServiceDeploy> = {}): ServiceDeploy =>
      service({
        config: { ...config, localBuild: true },
        existing,
        baseImage: "nodejs22",
        ...overrides,
      });
    let validateNodeStub: sinon.SinonStub;
    let localBuildStub: sinon.SinonStub;
    let mkdtemp: sinon.SinonSpy;

    beforeEach(() => {
      sinon.stub(apphostingPrepare, "prepareLocalBuildScratchDirectory").resolves();
      validateNodeStub = sinon.stub(localbuilds, "validateLocalBuildNodeVersion");
      localBuildStub = sinon.stub(localbuilds, "localBuild").resolves({
        outputFiles: [".next"],
        buildConfig: { runCommand: "node server.js" },
      });
      mkdtemp = sinon.spy(fs, "mkdtempSync");
    });

    it("builds locally and deploys the output without building on Cloud Build", async () => {
      await deployOne(localService());

      const scratchDir = mkdtemp.firstCall.returnValue as string;
      expect(validateNodeStub).to.have.been.calledWith(
        { runtime: { value: "nodejs22" } },
        "/p/web",
      );
      expect(localBuildStub).to.have.been.calledWith(
        "p",
        scratchDir,
        {},
        {
          nonInteractive: undefined,
          allowLocalBuildSecrets: true,
          rootDir: "web",
        },
      );
      expect(tarArchiveStub).to.have.been.calledWithMatch({ backendId: "s" }, scratchDir, [
        ".next",
      ]);
      expect(submitBuildStub).not.to.have.been.called;
      expect(updateServiceStub.firstCall.args[0].template.containers[0]).to.deep.equal({
        name: "s",
        image: "scratch",
        sourceCode: { cloudStorageSource: { bucket: "bucket", object: "out.tar.gz" } },
        command: ["node", "server.js"],
        baseImageUri: "nodejs22",
      });
      expect(fs.existsSync(scratchDir)).to.be.false;
    });

    it("passes build env and secrets to the local build and merges runtime output env", async () => {
      localBuildStub.resolves({
        outputFiles: [".next"],
        buildConfig: {
          runCommand: "node server.js",
          env: [
            { variable: "NODE_ENV", value: "production", availability: ["RUNTIME"] },
            { variable: "CUSTOM", value: "from-build", availability: ["RUNTIME"] },
          ],
        },
      });
      const svcWithEnv = {
        ...existing,
        template: {
          containers: [{ name: "s", image: "old", env: [{ name: "CUSTOM", value: "user-val" }] }],
        },
      } as unknown as runv2.Service;

      await deployOne(
        localService({
          existing: svcWithEnv,
          buildEnv: { A: "1", TOKEN: { secret: "t", version: "2" } },
        }),
      );
      expect(localBuildStub.firstCall.args[2]).to.deep.equal({
        A: { value: "1", availability: ["BUILD"] },
        TOKEN: { secret: "t@2", availability: ["BUILD"] },
      });
      expect(updateServiceStub.firstCall.args[0].template.containers[0].env).to.deep.equal([
        { name: "CUSTOM", value: "user-val" },
        { name: "NODE_ENV", value: "production" },
      ]);
    });

    it("cleans up and deploys nothing if the local build fails", async () => {
      localBuildStub.rejects(new Error("boom"));
      await expect(deployOne(localService())).to.be.rejectedWith("boom");
      expect(fs.existsSync(mkdtemp.firstCall.returnValue as string)).to.be.false;
      expect(updateServiceStub).not.to.have.been.called;
    });
  });

  it("switches a service from a local build back to a source build", async () => {
    const existing = {
      name: "projects/p/locations/us-central1/services/s",
      template: {
        containers: [
          {
            name: "s",
            image: "scratch",
            command: ["node", "server.js"],
            sourceCode: { cloudStorageSource: { bucket: "b", object: "o" } },
          },
        ],
      },
    } as unknown as runv2.Service;

    await deployOne(service({ existing }));

    const container = updateServiceStub.firstCall.args[0].template.containers[0];
    expect(container).not.to.have.property("sourceCode");
    expect(container).not.to.have.property("command");
  });

  it("logs the deployed URL of each service during release", async () => {
    const { release } = await import("./release");
    const utils = await import("../../utils");
    const logStub = sinon.stub(utils, "logLabeledSuccess");

    await release({ projectId: "p" }, options, {
      run: {
        services: [service({ deployed: { uri: "https://s-123.run.app" } as runv2.Service })],
      },
    });

    expect(logStub).to.have.been.calledOnceWithExactly(
      "run",
      "Deployed service s to https://s-123.run.app",
    );
  });
});
