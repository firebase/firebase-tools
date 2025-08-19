import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as artifactRegistry from "./artifactregistry";
import * as api from "../api";

const PROJECT_ID = "test-project-id";
const REPO_NAME = "test-repo";
const REPO_PATH = `projects/${PROJECT_ID}/locations/us-central1/repositories/${REPO_NAME}`;

describe("artifactRegistry", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("deletePackage", () => {
    const pkg =
      "projects/test-project/locations/us-central1/repositories/test-repo/packages/test-pkg";
    it("should resolve with Operation on success", async () => {
      const op: artifactRegistry.Operation = {
        name: `projects/test-project/locations/us-central1/operations/long-running-op`,
        done: false,
      };
      nock(api.artifactRegistryDomain())
        .delete(`/${artifactRegistry.API_VERSION}/${pkg}`)
        .reply(200, op);

      const resp = await artifactRegistry.deletePackage(pkg);

      expect(resp).to.deep.equal(op);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if api returns error", async () => {
      nock(api.artifactRegistryDomain())
        .delete(`/${artifactRegistry.API_VERSION}/${pkg}`)
        .reply(404, { error: { message: "Not Found" } });

      await expect(artifactRegistry.deletePackage(pkg)).to.be.rejectedWith("Not Found");

      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getRepository", () => {
    it("should resolve with a Repository on success", async () => {
      const repo: artifactRegistry.Repository = {
        name: REPO_PATH,
        format: "DOCKER",
        description: "test repo",
        createTime: "2020-01-01T00:00:00Z",
        updateTime: "2020-01-01T00:00:00Z",
      };
      nock(api.artifactRegistryDomain())
        .get(`/${artifactRegistry.API_VERSION}/${REPO_PATH}`)
        .reply(200, repo);

      const resp = await artifactRegistry.getRepository(REPO_PATH);

      expect(resp).to.deep.equal(repo);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if api returns error", async () => {
      nock(api.artifactRegistryDomain())
        .get(`/${artifactRegistry.API_VERSION}/${REPO_PATH}`)
        .reply(404, { error: { message: "Not Found" } });

      await expect(artifactRegistry.getRepository(REPO_PATH)).to.be.rejectedWith("Not Found");

      expect(nock.isDone()).to.be.true;
    });
  });

  describe("updateRepository", () => {
    const UPDATE_MASK = "labels,cleanupPolicies,cleanupPolicyDryRun";
    const REPO_INPUT: artifactRegistry.RepositoryInput = {
      name: REPO_PATH,
      labels: {
        "test-label": "test-value",
      },
      cleanupPolicies: {
        "test-policy": {
          id: "test-policy",
          action: "DELETE",
          condition: {
            tagState: "TAGGED",
            olderThan: "30d",
          },
        },
      },
      cleanupPolicyDryRun: true,
    };

    it("should resolve with a Repository on success", async () => {
      const expectedRepo: artifactRegistry.Repository = {
        ...REPO_INPUT,
        format: "DOCKER",
        description: "test repo",
        createTime: "2020-01-01T00:00:00Z",
        updateTime: "2020-01-01T00:00:00Z",
      };
      nock(api.artifactRegistryDomain())
        .patch(`/${artifactRegistry.API_VERSION}/${REPO_PATH}?updateMask=${UPDATE_MASK}`)
        .reply(200, expectedRepo);

      const resp = await artifactRegistry.updateRepository(REPO_INPUT);

      expect(resp).to.deep.equal(expectedRepo);
      expect(nock.isDone()).to.be.true;
    });

    it("should call getRepository if no fields are updated", async () => {
      const getRepo: artifactRegistry.Repository = {
        name: REPO_PATH,
        format: "DOCKER",
        description: "test repo",
        createTime: "2020-01-01T00:00:00Z",
        updateTime: "2020-01-01T00:00:00Z",
      };
      nock(api.artifactRegistryDomain())
        .get(`/${artifactRegistry.API_VERSION}/${REPO_PATH}`)
        .reply(200, getRepo);

      const resp = await artifactRegistry.updateRepository({ name: REPO_PATH });

      expect(resp).to.deep.equal(getRepo);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if api returns error", async () => {
      nock(api.artifactRegistryDomain())
        .patch(`/${artifactRegistry.API_VERSION}/${REPO_PATH}?updateMask=${UPDATE_MASK}`)
        .reply(404, { error: { message: "Not Found" } });

      await expect(artifactRegistry.updateRepository(REPO_INPUT)).to.be.rejectedWith("Not Found");

      expect(nock.isDone()).to.be.true;
    });
  });
});
