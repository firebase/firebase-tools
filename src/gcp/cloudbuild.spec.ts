import { expect } from "chai";
import nock from "nock";
import * as cloudbuild from "./cloudbuild";
import { cloudbuildOrigin } from "../api";

const PROJECT_ID = "test-project";
const LOCATION = "us-central1";

describe("cloudbuild", () => {
  const CONNECTION_ID = "test-connection";
  const REPO_ID = "test-repo";
  const OP_NAME = "operations/test-op";

  afterEach(() => {
    nock.cleanAll();
  });

  describe("createConnection", () => {
    it("should resolve with an operation on success", async () => {
      const operation = { name: OP_NAME, done: false };
      nock(cloudbuildOrigin())
        .post(
          `/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections?connectionId=${CONNECTION_ID}`,
        )
        .reply(200, operation);

      const result = await cloudbuild.createConnection(PROJECT_ID, LOCATION, CONNECTION_ID);

      expect(result).to.deep.equal(operation);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getConnection", () => {
    it("should resolve with a connection on success", async () => {
      const connection = { name: "test-connection" };
      nock(cloudbuildOrigin())
        .get(`/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections/${CONNECTION_ID}`)
        .reply(200, connection);

      const result = await cloudbuild.getConnection(PROJECT_ID, LOCATION, CONNECTION_ID);

      expect(result).to.deep.equal(connection);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("listConnections", () => {
    it("should resolve with a list of connections on success", async () => {
      const connections = [{ name: "test-connection" }];
      nock(cloudbuildOrigin())
        .get(`/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections`)
        .query({ pageSize: 100, pageToken: "" })
        .reply(200, { connections: connections });

      const result = await cloudbuild.listConnections(PROJECT_ID, LOCATION);

      expect(result).to.deep.equal(connections);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteConnection", () => {
    it("should resolve with an operation on success", async () => {
      const operation = { name: OP_NAME, done: false };
      nock(cloudbuildOrigin())
        .delete(`/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections/${CONNECTION_ID}`)
        .reply(200, operation);

      const result = await cloudbuild.deleteConnection(PROJECT_ID, LOCATION, CONNECTION_ID);

      expect(result).to.deep.equal(operation);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("createRepository", () => {
    it("should resolve with an operation on success", async () => {
      const operation = { name: OP_NAME, done: false };
      nock(cloudbuildOrigin())
        .post(
          `/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections/${CONNECTION_ID}/repositories?repositoryId=${REPO_ID}`,
        )
        .reply(200, operation);

      const result = await cloudbuild.createRepository(
        PROJECT_ID,
        LOCATION,
        CONNECTION_ID,
        REPO_ID,
        "https://github.com/test/repo",
      );

      expect(result).to.deep.equal(operation);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getRepository", () => {
    it("should resolve with a repository on success", async () => {
      const repository = { name: "test-repo" };
      nock(cloudbuildOrigin())
        .get(
          `/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections/${CONNECTION_ID}/repositories/${REPO_ID}`,
        )
        .reply(200, repository);

      const result = await cloudbuild.getRepository(PROJECT_ID, LOCATION, CONNECTION_ID, REPO_ID);

      expect(result).to.deep.equal(repository);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteRepository", () => {
    it("should resolve with an operation on success", async () => {
      const operation = { name: OP_NAME, done: false };
      nock(cloudbuildOrigin())
        .delete(
          `/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections/${CONNECTION_ID}/repositories/${REPO_ID}`,
        )
        .reply(200, operation);

      const result = await cloudbuild.deleteRepository(
        PROJECT_ID,
        LOCATION,
        CONNECTION_ID,
        REPO_ID,
      );

      expect(result).to.deep.equal(operation);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("fetchLinkableRepositories", () => {
    it("should resolve with a list of linkable repositories on success", async () => {
      const repositories = { repositories: [{ name: "test-repo" }] };
      nock(cloudbuildOrigin())
        .get(
          `/v2/projects/${PROJECT_ID}/locations/${LOCATION}/connections/${CONNECTION_ID}:fetchLinkableRepositories`,
        )
        .query({ pageSize: 1000, pageToken: "" })
        .reply(200, repositories);

      const result = await cloudbuild.fetchLinkableRepositories(
        PROJECT_ID,
        LOCATION,
        CONNECTION_ID,
      );

      expect(result).to.deep.equal(repositories);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getDefaultServiceAccount", () => {
    it("should return the default service account", () => {
      const projectNumber = "123456789";
      const result = cloudbuild.getDefaultServiceAccount(projectNumber);
      expect(result).to.equal("123456789@cloudbuild.gserviceaccount.com");
    });
  });

  describe("getDefaultServiceAgent", () => {
    it("should return the default service agent", () => {
      const projectNumber = "123456789";
      const result = cloudbuild.getDefaultServiceAgent(projectNumber);
      expect(result).to.equal("service-123456789@gcp-sa-cloudbuild.iam.gserviceaccount.com");
    });
  });
});
