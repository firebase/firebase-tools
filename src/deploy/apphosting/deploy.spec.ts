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
        env: [],
      },
    },
  };
}

describe("apphosting", () => {
  let upsertBucketStub: sinon.SinonStub;
  let uploadObjectStub: sinon.SinonStub;
  let createTarArchiveStub: sinon.SinonStub;
  let createReadStreamStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectNumberStub = sinon
      .stub(getProjectNumber, "getProjectNumber")
      .throws("Unexpected getProjectNumber call");
    upsertBucketStub = sinon.stub(gcs, "upsertBucket").throws("Unexpected upsertBucket call");
    uploadObjectStub = sinon.stub(gcs, "uploadObject").throws("Unexpected uploadObject call");
    createTarArchiveStub = sinon
      .stub(util, "createTarArchive")
      .throws("Unexpected createTarArchive call");
    createReadStreamStub = sinon
      .stub(fs, "createReadStream")
      .throws("Unexpected createReadStream call");
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
      createTarArchiveStub.onFirstCall().resolves("path/to/foo-1234.tar.gz");
      createTarArchiveStub.onSecondCall().resolves("path/to/foo-local-build-1234.tar.gz");

      uploadObjectStub.onFirstCall().resolves({
        bucket: bucketName,
        object: "foo-1234",
      });
      uploadObjectStub.onSecondCall().resolves({
        bucket: bucketName,
        object: "foo-local-build-1234",
      });

      createReadStreamStub.returns("stream" as any);

      await deploy(context, opts);

      // assert backend foo calls

      expect(upsertBucketStub).to.be.calledWith({
        product: "apphosting",
        createMessage: `Creating Cloud Storage bucket in ${location} to store App Hosting source code uploads at ${bucketName}...`,
        projectId: "my-project",
        req: {
          baseName: bucketName,
          purposeLabel: `apphosting-source-${location}`,
          location: location,
          lifecycle: {
            rule: [
              {
                action: { type: "Delete" },
                condition: { age: 30 },
              },
            ],
          },
        },
      });

      // assert backend fooLocalBuild calls
      expect(upsertBucketStub).to.be.calledWith({
        product: "apphosting",
        createMessage:
          "Creating Cloud Storage bucket in us-central1 to store App Hosting source code uploads at firebaseapphosting-sources-000000000000-us-central1...",
        projectId: "my-project",
        req: {
          baseName: "firebaseapphosting-sources-000000000000-us-central1",
          purposeLabel: `apphosting-source-${location}`,
          location: "us-central1",
          lifecycle: {
            rule: [
              {
                action: { type: "Delete" },
                condition: { age: 30 },
              },
            ],
          },
        },
      });
      expect(createTarArchiveStub).to.be.calledWithExactly(
        context.backendConfigs["fooLocalBuild"],
        process.cwd(),
        "./nextjs/standalone",
      );
      expect(uploadObjectStub).to.be.calledWithMatch(
        sinon.match.any,
        "firebaseapphosting-sources-000000000000-us-central1",
      );
    });

    it("correctly creates and sets storage URIs", async () => {
      const context = initializeContext();
      const projectNumber = "000000000000";
      const location = "us-central1";
      const bucketName = `firebaseapphosting-sources-${projectNumber}-${location}`;
      getProjectNumberStub.resolves(projectNumber);
      upsertBucketStub.resolves(bucketName);
      createTarArchiveStub.onFirstCall().resolves("path/to/foo-1234.tar.gz");
      createTarArchiveStub.onSecondCall().resolves("path/to/foo-local-build-1234.tar.gz");

      uploadObjectStub.onFirstCall().resolves({
        bucket: bucketName,
        object: "foo-1234",
      });

      uploadObjectStub.onSecondCall().resolves({
        bucket: bucketName,
        object: "foo-local-build-1234",
      });
      createReadStreamStub.returns("stream" as any);

      await deploy(context, opts);

      expect(context.backendStorageUris["foo"]).to.equal(`gs://${bucketName}/foo-1234.tar.gz`);
      expect(context.backendStorageUris["fooLocalBuild"]).to.equal(
        `gs://${bucketName}/foo-local-build-1234.tar.gz`,
      );
    });
  });
});
