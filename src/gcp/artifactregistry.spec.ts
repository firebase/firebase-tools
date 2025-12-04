import { expect } from "chai";
import nock from "nock";
import * as sinon from "sinon";
import * as artifactRegistry from "./artifactregistry";
import { artifactRegistryDomain } from "../api";
import * as api from "../ensureApiEnabled";

const API_VERSION = "v1";
const PROJECT_ID = "test-project";
const REGION = "us-central1";
const REPO = "test-repo";
const REPO_NAME = `projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPO}`;

describe("artifactRegistry", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("getRepository", () => {
    it("should resolve with a repository object on success", async () => {
      const repository: artifactRegistry.Repository = {
        name: REPO_NAME,
        format: "DOCKER",
        description: "test repo",
        createTime: "2022-01-01T00:00:00Z",
        updateTime: "2022-01-01T00:00:00Z",
      };
      nock(artifactRegistryDomain()).get(`/${API_VERSION}/${REPO_NAME}`).reply(200, repository);

      const result = await artifactRegistry.getRepository(REPO_NAME);

      expect(result).to.deep.equal(repository);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if the API call fails", async () => {
      nock(artifactRegistryDomain())
        .get(`/${API_VERSION}/${REPO_NAME}`)
        .reply(404, { error: { message: "Not Found" } });

      await expect(artifactRegistry.getRepository(REPO_NAME)).to.be.rejectedWith("Not Found");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deletePackage", () => {
    const PKG_NAME = `${REPO_NAME}/packages/test-pkg`;

    it("should resolve with an operation object on success", async () => {
      const operation: artifactRegistry.Operation = {
        name: `projects/${PROJECT_ID}/locations/${REGION}/operations/test-op`,
        done: true,
      };
      nock(artifactRegistryDomain()).delete(`/${API_VERSION}/${PKG_NAME}`).reply(200, operation);

      const result = await artifactRegistry.deletePackage(PKG_NAME);

      expect(result).to.deep.equal(operation);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if the API call fails", async () => {
      nock(artifactRegistryDomain())
        .delete(`/${API_VERSION}/${PKG_NAME}`)
        .reply(403, { error: { message: "Permission Denied" } });

      await expect(artifactRegistry.deletePackage(PKG_NAME)).to.be.rejectedWith(
        "Permission Denied",
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("updateRepository", () => {
    it("should send a patch request with update mask if one is present", async () => {
      const repo: artifactRegistry.RepositoryInput = {
        name: REPO_NAME,
        labels: {
          foo: "bar",
        },
      };
      const resultRepo: artifactRegistry.Repository = {
        ...repo,
        format: "DOCKER",
        description: "test repo",
        createTime: "2022-01-01T00:00:00Z",
        updateTime: "2022-01-01T00:00:00Z",
      };

      nock(artifactRegistryDomain())
        .patch(`/${API_VERSION}/${REPO_NAME}?updateMask=name,labels`)
        .reply(200, resultRepo);

      const result = await artifactRegistry.updateRepository(repo);

      expect(result).to.deep.equal(resultRepo);
      expect(nock.isDone()).to.be.true;
    });

    it("should send a patch request if only name is present", async () => {
      const repo: artifactRegistry.RepositoryInput = {
        name: REPO_NAME,
      };
      const resultRepo: artifactRegistry.Repository = {
        ...repo,
        format: "DOCKER",
        description: "test repo",
        createTime: "2022-01-01T00:00:00Z",
        updateTime: "2022-01-01T00:00:00Z",
      };

      nock(artifactRegistryDomain())
        .patch(`/${API_VERSION}/${REPO_NAME}?updateMask=name`)
        .reply(200, resultRepo);

      const result = await artifactRegistry.updateRepository(repo);

      expect(result).to.deep.equal(resultRepo);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("ensureApiEnabled", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });
    it("should call the ensure api", async () => {
      const ensureApiStub = sandbox.stub(api, "ensure").resolves();
      await artifactRegistry.ensureApiEnabled(PROJECT_ID);
      expect(ensureApiStub).to.have.been.calledWith(
        PROJECT_ID,
        "https://artifactregistry.googleapis.com",
        "artifactregistry",
        true,
      );
    });
  });
});
