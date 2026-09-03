import { expect } from "chai";
import * as sinon from "sinon";
import * as runFeature from "./run";
import * as prompt from "../../prompt";
import * as fs from "fs";
import { Config } from "../../config";
import { Setup } from "../index";
import { FirebaseError } from "../../error";
import * as runv2 from "../../gcp/runv2";

function createMockSetup(overrides: Partial<Setup> = {}): Setup {
  return {
    config: {},
    rcfile: { projects: {}, targets: {}, etags: {} },
    instructions: [],
    ...overrides,
  };
}

describe("init features run", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should prompt for region, serviceId, and rootDir with correct messages and defaults", async () => {
      const inputStub = sandbox.stub(prompt, "input");
      inputStub.onFirstCall().resolves("us-central1");
      inputStub.onSecondCall().resolves("custom-service");
      inputStub.onThirdCall().resolves("/");

      const setup = createMockSetup({ projectId: "test-project" });
      await runFeature.askQuestions(setup);

      expect(setup.featureInfo?.run).to.deep.equal({
        serviceId: "custom-service",
        region: "us-central1",
        rootDir: "/",
      });

      // Verify prompt 1: Region (defaults to us-central1)
      const regionCall = inputStub.firstCall.args[0];
      expect(regionCall.message).to.equal("Which region should this service be deployed to?");
      expect(regionCall.default).to.equal("us-central1");
      expect(regionCall.validate("INVALID REGION")).to.be.a("string");
      expect(regionCall.validate("us-central1")).to.be.true;

      // Verify prompt 2: Service ID (no default)
      const serviceCall = inputStub.secondCall.args[0];
      expect(serviceCall.message).to.equal("Please enter a unique ID for your service");
      expect(serviceCall.default).to.be.undefined;
      expect(serviceCall.validate("ab")).to.be.a("string");
      expect(serviceCall.validate("my-service-")).to.be.a("string");
      expect(serviceCall.validate("My-Service")).to.be.a("string");
      expect(serviceCall.validate("a".repeat(64))).to.be.a("string");
      expect(serviceCall.validate("custom-service")).to.be.true;

      // Verify prompt 3: Root directory (defaults to /)
      const rootDirCall = inputStub.thirdCall.args[0];
      expect(rootDirCall.message).to.equal(
        "Specify your app's root directory relative to your firebase.json directory",
      );
      expect(rootDirCall.default).to.equal("/");
      expect(rootDirCall.validate("/")).to.be.true;
    });

    it("should validate rootDir existence against config.projectDir", async () => {
      const inputStub = sandbox.stub(prompt, "input");
      inputStub.onFirstCall().resolves("us-central1");
      inputStub.onSecondCall().resolves("custom-service");
      inputStub.onThirdCall().resolves("non-existent-folder");

      const existsSyncStub = sandbox.stub(fs, "existsSync");
      existsSyncStub.withArgs("/path/to/project/non-existent-folder").returns(false);
      existsSyncStub.withArgs("/path/to/project/valid-folder").returns(true);

      const setup = createMockSetup({ projectId: "test-project" });
      const config = new Config({}, {});
      config.projectDir = "/path/to/project";

      await runFeature.askQuestions(setup, config);

      const rootDirCall = inputStub.thirdCall.args[0];
      expect(rootDirCall.validate("non-existent-folder")).to.include("does not exist");
      expect(rootDirCall.validate("valid-folder")).to.be.true;
    });

    it("should throw FirebaseError if projectId is missing", async () => {
      const setup = createMockSetup();
      try {
        await runFeature.askQuestions(setup);
        expect.fail("Expected askQuestions to throw");
      } catch (err: any) {
        expect(err).to.be.instanceOf(FirebaseError);
        expect(err.message).to.equal("Project ID must be set before initializing Cloud Run.");
        expect(err.exit).to.equal(1);
      }
    });
  });

  describe("actuate", () => {
    let existsSyncStub: sinon.SinonStub;
    let getServiceStub: sinon.SinonStub;
    let createServiceStub: sinon.SinonStub;

    beforeEach(() => {
      existsSyncStub = sandbox.stub(fs, "existsSync");
      getServiceStub = sandbox.stub(runv2, "getService");
      createServiceStub = sandbox.stub(runv2, "createService");
    });

    it("should do nothing if featureInfo.run is not present", async () => {
      const setup = createMockSetup({ projectId: "test-project" });
      const config = new Config({}, {});

      await runFeature.actuate(setup, config);

      expect(config.src.run).to.be.undefined;
      expect(getServiceStub.notCalled).to.be.true;
    });

    it("should throw FirebaseError if projectId is missing", async () => {
      const setup = createMockSetup({
        featureInfo: {
          run: {
            serviceId: "my-svc",
            region: "us-central1",
            rootDir: ".",
          },
        },
      });
      const config = new Config({}, {});

      try {
        await runFeature.actuate(setup, config);
        expect.fail("Expected actuate to throw");
      } catch (err: any) {
        expect(err).to.be.instanceOf(FirebaseError);
        expect(err.message).to.equal("Project ID must be set before initializing Cloud Run.");
        expect(err.exit).to.equal(1);
      }
    });

    it("should create placeholder service with 0% traffic when service does not exist in GCP", async () => {
      const setup = createMockSetup({
        projectId: "test-project",
        featureInfo: {
          run: {
            serviceId: "my-svc",
            region: "us-central1",
            rootDir: ".",
          },
        },
      });
      const config = new Config({}, {});
      sandbox.stub(config, "writeProjectFile");
      const askWriteStub = sandbox.stub(config, "askWriteProjectFile").resolves();

      existsSyncStub.returns(false);
      const notFoundErr = new Error("Not Found") as any;
      notFoundErr.status = 404;
      getServiceStub.rejects(notFoundErr);
      createServiceStub.resolves({ uri: "https://my-svc.a.run.app" });

      await runFeature.actuate(setup, config);

      expect(createServiceStub.calledOnce).to.be.true;
      const createdService = createServiceStub.args[0][3] as runv2.Service;
      expect(createdService.template.containers?.[0].image).to.equal(
        "us-docker.pkg.dev/cloudrun/container/hello",
      );
      expect(createdService.invokerIamDisabled).to.be.true;
      expect(setup.instructions).to.include(
        "Your Cloud Run service URL is: https://my-svc.a.run.app",
      );

      const runConfigs = config.src.run as Array<{ serviceId: string }>;
      expect(runConfigs).to.be.an("array");
      expect(runConfigs[0].serviceId).to.equal("my-svc");
      expect(askWriteStub.calledOnce).to.be.true;
    });

    it("should not create service if service already exists in GCP", async () => {
      const setup = createMockSetup({
        projectId: "test-project",
        featureInfo: {
          run: {
            serviceId: "my-svc",
            region: "us-central1",
            rootDir: ".",
          },
        },
      });
      const config = new Config({}, {});
      sandbox.stub(config, "writeProjectFile");
      existsSyncStub.returns(true);
      getServiceStub.resolves({ uri: "https://existing-svc.a.run.app" });

      await runFeature.actuate(setup, config);

      expect(createServiceStub.notCalled).to.be.true;
      expect(setup.instructions).to.include(
        "Your Cloud Run service URL is: https://existing-svc.a.run.app",
      );
    });

    it("should append to existing run configs array in firebase.json", async () => {
      const setup = createMockSetup({
        projectId: "test-project",
        featureInfo: {
          run: {
            serviceId: "second-svc",
            region: "us-central1",
            rootDir: "./app2",
          },
        },
      });
      const config = new Config(
        {
          run: [{ serviceId: "first-svc", region: "us-central1", rootDir: "./app1" }],
        },
        {},
      );
      sandbox.stub(config, "writeProjectFile");
      existsSyncStub.returns(true);
      getServiceStub.resolves({ uri: "https://second-svc.a.run.app" });

      await runFeature.actuate(setup, config);

      const runConfigs = config.src.run as Array<{ serviceId: string }>;
      expect(runConfigs).to.have.length(2);
      expect(runConfigs[0].serviceId).to.equal("first-svc");
      expect(runConfigs[1].serviceId).to.equal("second-svc");
    });
  });
});
