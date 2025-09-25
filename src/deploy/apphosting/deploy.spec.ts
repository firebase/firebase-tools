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
  interactive: false,
  debug: false,
  filteredTargets: [],
  rc: new RC(),
  json: false,
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
      }
    },
    backendLocations: { foo: "us-central1" , fooLocalBuild: "us-central1"},
    backendStorageUris: {},
    backendLocalBuilds: {
      fooLocalBuild: {
	buildDir: "./nextjs/standalone",
	buildConfig: {},
	annotations: {},
      },
    },
    };

describe("apphosting", () => {
  let upsertBucketStub: sinon.SinonStub;
  let uploadObjectStub: sinon.SinonStub;
  let createArchiveStub: sinon.SinonStub;
  let createReadStreamStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectNumberStub = sinon
      .stub(getProjectNumber, "getProjectNumber")
      .throws("Unexpected getProjectNumber call");
    upsertBucketStub = sinon.stub(gcs, "upsertBucket").throws("Unexpected upsertBucket call");
    uploadObjectStub = sinon.stub(gcs, "uploadObject").throws("Unexpected uploadObject call");
    createArchiveStub = sinon.stub(util, "createArchive").throws("Unexpected createArchive call");
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
      getProjectNumberStub.resolves("000000000000");
      upsertBucketStub.resolves();
      createArchiveStub.onFirstCall().resolves("path/to/foo-1234.zip");
      createArchiveStub.onSecondCall().resolves("path/to/foo-local-build-1234.zip");
      uploadObjectStub.onFirstCall().resolves({
        bucket: "firebaseapphosting-sources-12345678-us-central1",
        object: "foo-1234",
      });
      uploadObjectStub.onSecondCall().resolves({
        bucket: "firebaseapphosting-build-12345678-us-central1",
        object: "foo-local-build-1234",
      });

      createReadStreamStub.resolves();

      await deploy(context, opts);

      // assert backend foo calls
      expect(upsertBucketStub).to.be.calledWith({
        product: "apphosting",
        createMessage:
          "Creating Cloud Storage bucket in us-central1 to store App Hosting source code uploads at firebaseapphosting-sources-000000000000-us-central1...",
        projectId: "my-project",
        req: {
          name: "firebaseapphosting-sources-000000000000-us-central1",
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
      expect(createArchiveStub).to.be.calledWithExactly(
        context.backendConfigs.get("foo"),
        process.cwd(),
        undefined,
      );
      expect(uploadObjectStub).to.be.calledWithMatch(
        sinon.match.any,
        "firebaseapphosting-sources-000000000000-us-central1",
      );

      // assert backend foo-local-build calls
      expect(upsertBucketStub).to.be.calledWith({
	product: "apphosting",
	createMessage:
        "Creating Cloud Storage bucket in us-central1 to store App Hosting source code uploads at firebaseapphosting-sources-000000000000-us-central1...",
        projectId: "my-project",
        req: {
          name: "firebaseapphosting-build-000000000000-us-central1",
          location: "us-central1",
          rule: [
            {
              action: { type: "Delete" },
              condition: { age: 30 },
            },
          ],
        },
      });
      expect(createArchiveStub).to.be.calledWithExactly(
        context.backendConfigs.get("foo-local-build"),
        process.cwd(),
        "./nextjs/standalone",
      );
      expect(uploadObjectStub).to.be.calledWithMatch(
        sinon.match.any,
        "firebaseapphosting-build-000000000000-us-central1",
      );
    });

    it("correctly creates and sets storage URIs", async () => {
      const context = initializeContext();
      getProjectNumberStub.resolves("000000000000");
      upsertBucketStub.resolves();
      createArchiveStub.onFirstCall().resolves("path/to/foo-1234.zip");
      createArchiveStub.onSecondCall().resolves("path/to/foo-local-build-1234.zip");

      uploadObjectStub.onFirstCall().resolves({
        bucket: "firebaseapphosting-sources-000000000000-us-central1",
        object: "foo-1234",
      });

      uploadObjectStub.onSecondCall().resolves({
        bucket: "firebaseapphosting-build-000000000000-us-central1",
        object: "foo-local-build-1234",
      });
      createReadStreamStub.resolves();

      await deploy(context, opts);

      expect(context.backendStorageUris["foo"]).to.equal(
        "gs://firebaseapphosting-sources-000000000000-us-central1/foo-1234.zip",
      );
      expect(context.backendStorageUris.get("foo-local-build")).to.equal(
        "gs://firebaseapphosting-build-000000000000-us-central1/foo-local-build-1234.zip",
      );
    });
  });
});
