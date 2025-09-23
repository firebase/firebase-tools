import { expect } from "chai";
import * as sinon from "sinon";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
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
    backendConfigs: new Map<string, AppHostingSingle>([
      [
        "foo",
        {
          backendId: "foo",
          rootDir: "/",
          ignore: [],
        },
      ],
    ]),
    backendLocations: new Map<string, string>([["foo", "us-central1"]]),
    backendStorageUris: new Map<string, string>(),
  };
}

describe("apphosting", () => {
  let getBucketStub: sinon.SinonStub;
  let createBucketStub: sinon.SinonStub;
  let uploadObjectStub: sinon.SinonStub;
  let createArchiveStub: sinon.SinonStub;
  let createReadStreamStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectNumberStub = sinon
      .stub(getProjectNumber, "getProjectNumber")
      .throws("Unexpected getProjectNumber call");
    getBucketStub = sinon.stub(gcs, "getBucket").throws("Unexpected getBucket call");
    createBucketStub = sinon.stub(gcs, "createBucket").throws("Unexpected createBucket call");
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

    it("creates regional GCS bucket if one doesn't exist yet", async () => {
      const context = initializeContext();
      getProjectNumberStub.resolves("000000000000");
      getBucketStub.onFirstCall().rejects(
        new FirebaseError("error", {
          original: new FirebaseError("original error", { status: 404 }),
        }),
      );
      createBucketStub.resolves();
      createArchiveStub.resolves("path/to/foo-1234.zip");
      uploadObjectStub.resolves({
        bucket: "firebaseapphosting-sources-12345678-us-central1",
        object: "foo-1234",
      });
      createReadStreamStub.resolves();

      await deploy(context, opts);

      expect(createBucketStub).to.be.calledOnce;
    });

    it("correctly creates and sets storage URIs", async () => {
      const context = initializeContext();
      getProjectNumberStub.resolves("000000000000");
      getBucketStub.resolves();
      createBucketStub.resolves();
      createArchiveStub.resolves("path/to/foo-1234.zip");
      uploadObjectStub.resolves({
        bucket: "firebaseapphosting-sources-12345678-us-central1",
        object: "foo-1234",
      });
      createReadStreamStub.resolves();

      await deploy(context, opts);

      expect(context.backendStorageUris.get("foo")).to.equal(
        "gs://firebaseapphosting-sources-000000000000-us-central1/foo-1234.zip",
      );
    });
  });
});
