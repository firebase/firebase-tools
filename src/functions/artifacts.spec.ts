import { expect } from "chai";
import * as sinon from "sinon";

import * as artifactregistry from "../gcp/artifactregistry";
import * as artifacts from "./artifacts";

describe("functions artifacts", () => {
  let sandbox: sinon.SinonSandbox;
  let updateRepositoryStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    updateRepositoryStub = sandbox.stub(artifactregistry, "updateRepository").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("makeRepoPath", () => {
    it("should construct a valid repo path", () => {
      const path = artifacts.makeRepoPath("my-project", "us-central1");
      expect(path).to.equal("projects/my-project/locations/us-central1/repositories/gcf-artifacts");
    });
  });

  describe("findExistingPolicy", () => {
    it("should return undefined if repository has no cleanup policies", () => {
      const repo: artifactregistry.Repository = {
        name: "projects/my-project/locations/us-central1/repositories/gcf-artifacts",
        format: "DOCKER",
        description: "Cloud Functions container artifacts",
        createTime: "",
        updateTime: "",
      };

      const policy = artifacts.findExistingPolicy(repo);
      expect(policy).to.be.undefined;
    });

    it("should return undefined if policy doesn't exist", () => {
      const repo: artifactregistry.Repository = {
        name: "projects/my-project/locations/us-central1/repositories/gcf-artifacts",
        format: "DOCKER",
        description: "Cloud Functions container artifacts",
        createTime: "",
        updateTime: "",
        cleanupPolicies: {
          "other-policy": {
            id: "other-policy",
            action: "DELETE",
            condition: {
              tagState: "ANY",
              olderThan: "432000s",
            },
          },
        },
      };

      const policy = artifacts.findExistingPolicy(repo);
      expect(policy).to.be.undefined;
    });

    it("should return the policy if it exists", () => {
      const expectedPolicy: artifactregistry.CleanupPolicy = {
        id: "policy-id",
        action: "DELETE",
        condition: {
          tagState: "ANY",
          olderThan: "432000s",
        },
      };

      const repo: artifactregistry.Repository = {
        name: "projects/my-project/locations/us-central1/repositories/gcf-artifacts",
        format: "DOCKER",
        description: "Cloud Functions container artifacts",
        createTime: "",
        updateTime: "",
        cleanupPolicies: {
          "policy-id": expectedPolicy,
        },
      };

      const policy = artifacts.findExistingPolicy(repo);
      expect(policy).to.deep.equal(expectedPolicy);
    });
  });

  describe("daysToSeconds", () => {
    it("should convert days to seconds with 's' suffix", () => {
      expect(artifacts.daysToSeconds(1)).to.equal("86400s");
      expect(artifacts.daysToSeconds(5)).to.equal("432000s");
      expect(artifacts.daysToSeconds(30)).to.equal("2592000s");
    });
  });

  describe("parseDaysFromPolicy", () => {
    it("should correctly parse seconds into days", () => {
      expect(artifacts.parseDaysFromPolicy("86400s")).to.equal(1);
      expect(artifacts.parseDaysFromPolicy("432000s")).to.equal(5);
      expect(artifacts.parseDaysFromPolicy("2592000s")).to.equal(30);
    });

    it("should return undefined for invalid formats", () => {
      expect(artifacts.parseDaysFromPolicy("5d")).to.be.undefined;
      expect(artifacts.parseDaysFromPolicy("invalid")).to.be.undefined;
      expect(artifacts.parseDaysFromPolicy("")).to.be.undefined;
    });
  });

  describe("hasSameCleanupPolicy", () => {
    it("should return true if policy exists with same settings", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        cleanupPolicies: {
          "test-policy": {
            id: "test-policy",
            action: "DELETE",
            condition: {
              tagState: "ANY",
              olderThan: "432000s", // 5 days
            },
          },
        },
      };

      expect(artifacts.hasSameCleanupPolicy(repo, 5)).to.be.true;
    });

    it("should return false if policy doesn't exist", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
      };

      expect(artifacts.hasSameCleanupPolicy(repo, 5)).to.be.false;
    });

    it("should return false if policy exists with different days", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        cleanupPolicies: {
          "test-policy": {
            id: "test-policy",
            action: "DELETE",
            condition: {
              tagState: "ANY",
              olderThan: "259200s", // 3 days
            },
          },
        },
      };

      expect(artifacts.hasSameCleanupPolicy(repo, 5)).to.be.false;
    });

    it("should return false if policy exists with different tag state", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        cleanupPolicies: {
          "test-policy": {
            id: "test-policy",
            action: "DELETE",
            condition: {
              tagState: "TAGGED",
              olderThan: "432000s", // 5 days
            },
          },
        },
      };

      expect(artifacts.hasSameCleanupPolicy(repo, 5)).to.be.false;
    });

    it("should return false if policy exists without olderThan condition", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        cleanupPolicies: {
          "test-policy": {
            id: "test-policy",
            action: "DELETE",
            condition: {
              tagState: "ANY",
              olderThan: "",
            },
          },
        },
      };

      expect(artifacts.hasSameCleanupPolicy(repo, 5)).to.be.false;
    });
  });
});
