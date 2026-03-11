import { expect } from "chai";
import * as sinon from "sinon";
import { Config } from "../../config";
import * as gcs from "../../gcp/storage";
import { RC } from "../../rc";
import { Context } from "./args";
import deploy from "./deploy";
import * as util from "./util";
import * as fs from "fs";
import * as getProjectNumber from "../../getProjectNumber";
import * as experiments from "../../experiments";

const BASE_OPTS = {
  cwd: "/",
  configPath: "/",
  except: "",
  force: false,
  nonInteractive: false,
  debug: false,
  filteredTargets: [],
  rc: new RC(),
};

function initializeContext(): Context {
  return {
    backendConfigs: {
      foo: {
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      },
      fooLocalBuild: {
        backendId: "fooLocalBuild",
        rootDir: "/",
        ignore: [],
        localBuild: true,
      },
    },
    backendLocations: { foo: "us-central1", fooLocalBuild: "us-central1" },
    backendStorageUris: {},
    backendLocalBuilds: {
      fooLocalBuild: {
        buildDir: "./nextjs/standalone",
        buildConfig: {},
        annotations: {},
      },
    },
  };
}

describe("apphosting", () => {
  let upsertBucketStub: sinon.SinonStub;
  let uploadObjectStub: sinon.SinonStub;
  let createArchiveStub: sinon.SinonStub;
  let createTarArchiveStub: sinon.SinonStub;
  let createReadStreamStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let isEnabledStub: sinon.SinonStub;
  let assertEnabledStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectNumberStub = sinon
      .stub(getProjectNumber, "getProjectNumber")
      .throws("Unexpected getProjectNumber call");
    upsertBucketStub = sinon.stub(gcs, "upsertBucket").throws("Unexpected upsertBucket call");
    uploadObjectStub = sinon.stub(gcs, "uploadObject").throws("Unexpected uploadObject call");
    createArchiveStub = sinon.stub(util, "createArchive").throws("Unexpected createArchive call");
    createTarArchiveStub = sinon
      .stub(util, "createTarArchive")
      .throws("Unexpected createTarArchive call");
    createReadStreamStub = sinon
      .stub(fs, "createReadStream")
      .throws("Unexpected createReadStream call");
    isEnabledStub = sinon.stub(experiments, "isEnabled").returns(false);
    assertEnabledStub = sinon.stub(experiments, "assertEnabled").callsFake((name, task) => {
      if (!experiments.isEnabled(name)) {
        throw new Error(`Cannot ${task} because the experiment ${name} is not enabled.`);
      }
    });
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("deploy local source", () => {
    const opts = {
      ...BASE_OPTS,
      projectId: "my-project",
      only: "apphosting",
      config: new Config({
        apphosting: [
          {
            backendId: "foo",
            rootDir: "/",
            ignore: [],
          },
          {
            backendId: "fooLocalBuild",
            rootDir: "/",
            ignore: [],
            localBuild: true,
          },
        ],
      }),
    };

    it("upserts regional GCS bucket", async () => {
      const context = initializeContext();
      const projectNumber = "000000000000";
      const location = "us-central1";
      const bucketName = `firebaseapphosting-sources-${projectNumber}-${location}`;
      getProjectNumberStub.resolves(projectNumber);
      upsertBucketStub.resolves(bucketName);
      createArchiveStub.onFirstCall().resolves("path/to/foo-1234.zip");
      createTarArchiveStub.onFirstCall().resolves("path/to/foo-local-build-1234.tar.gz");

      uploadObjectStub.onFirstCall().resolves({
        bucket: bucketName,
        object: "foo-1234",
      });
      uploadObjectStub.onSecondCall().resolves({
        bucket: bucketName,
        object: "foo-local-build-1234.tar.gz",
      });

      createReadStreamStub.returns("stream" as any);
      // For standard source deploy, experiment is not required.
      // But fooLocalBuild will trigger assertEnabled.
      isEnabledStub.withArgs("apphostinglocalbuilds").returns(true);

      await deploy(context, opts);

      expect(upsertBucketStub).to.be.calledWithMatch({ projectId: "my-project" });
    });

    it("fails for local builds when experiment is disabled", async () => {
      const context = initializeContext();
      delete context.backendConfigs.foo;
      delete context.backendLocations.foo;
      
      getProjectNumberStub.resolves("000000");
      upsertBucketStub.resolves("bucket");
      isEnabledStub.withArgs("apphostinglocalbuilds").returns(false);

      const localOpts = { ...opts, config: new Config({ apphosting: { backendId: "fooLocalBuild", localBuild: true } }) };
      await deploy(context, localOpts);

      expect(createTarArchiveStub).to.not.be.called;
      expect(createArchiveStub).to.not.be.called;
    });

    it("uses createTarArchive for local builds when experiment is enabled", async () => {
      const context = initializeContext();
      delete context.backendConfigs.foo;
      delete context.backendLocations.foo;
      const projectNumber = "000000000000";
      const location = "us-central1";
      const bucketName = `firebaseapphosting-sources-${projectNumber}-${location}`;

      getProjectNumberStub.resolves(projectNumber);
      upsertBucketStub.resolves(bucketName);
      isEnabledStub.withArgs("apphostinglocalbuilds").returns(true);
      createTarArchiveStub.resolves("path/to/foo-local-build-1234.tar.gz");
      uploadObjectStub.resolves({
        bucket: bucketName,
        object: "foo-local-build-1234.tar.gz",
      });
      createReadStreamStub.returns("stream" as any);

      const localOpts = { ...opts, config: new Config({ apphosting: { backendId: "fooLocalBuild", localBuild: true } }) };
      await deploy(context, localOpts);

      expect(createTarArchiveStub).to.be.calledOnce;
      expect(createArchiveStub).to.not.be.called;
      expect(context.backendStorageUris["fooLocalBuild"]).to.equal(`gs://${bucketName}/foo-local-build-1234.tar.gz`);
    });
  });
});
