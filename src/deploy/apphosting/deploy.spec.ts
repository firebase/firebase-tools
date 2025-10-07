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
};

function initializeContext(): Context {
  return {
    backendConfigs: {
      foo: {
        backendId: "foo",
        rootDir: "/",
        ignore: [],
      },
    },
    backendLocations: { foo: "us-central1" },
    backendStorageUris: {},
  };
}

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

  describe("deploy", () => {
    const opts = {
      ...BASE_OPTS,
      projectId: "my-project",
      only: "apphosting",
      config: new Config({
        apphosting: {
          backendId: "foo",
          rootDir: "/",
          ignore: [],
        },
      }),
    };

    it("upserts regional GCS bucket", async () => {
      const context = initializeContext();
      const projectNumber = "000000000000";
      const location = "us-central1";
      const bucketName = `firebaseapphosting-sources-${projectNumber}-${location}`;

      getProjectNumberStub.resolves(projectNumber);
      upsertBucketStub.resolves(bucketName);
      createArchiveStub.resolves("path/to/foo-1234.zip");
      uploadObjectStub.resolves({
        bucket: bucketName,
        object: "foo-1234",
      });
      createReadStreamStub.returns("stream" as any);

      await deploy(context, opts);

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
    });

    it("correctly creates and sets storage URIs", async () => {
      const context = initializeContext();
      const projectNumber = "000000000000";
      const location = "us-central1";
      const bucketName = `firebaseapphosting-sources-${projectNumber}-${location}`;

      getProjectNumberStub.resolves(projectNumber);
      upsertBucketStub.resolves(bucketName);
      createArchiveStub.resolves("path/to/foo-1234.zip");
      uploadObjectStub.resolves({
        bucket: bucketName,
        object: "foo-1234",
      });
      createReadStreamStub.returns("stream" as any);

      await deploy(context, opts);

      expect(context.backendStorageUris["foo"]).to.equal(`gs://${bucketName}/foo-1234.zip`);
    });
  });
});
