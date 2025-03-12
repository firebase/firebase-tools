import { expect } from "chai";
import * as sinon from "sinon";

import * as artifactregistry from "../gcp/artifactregistry";
import * as artifacts from "./artifacts";

describe("functions artifacts", () => {
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
        id: artifacts.CLEANUP_POLICY_ID,
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
          [artifacts.CLEANUP_POLICY_ID]: expectedPolicy,
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

  describe("generateCleanupPolicy", () => {
    it("should generate a valid cleanup policy with the correct days", () => {
      const policy = artifacts.generateCleanupPolicy(7);
      expect(policy).to.have.property(artifacts.CLEANUP_POLICY_ID);
      expect(policy[artifacts.CLEANUP_POLICY_ID].id).to.equal(artifacts.CLEANUP_POLICY_ID);
      expect(policy[artifacts.CLEANUP_POLICY_ID].action).to.equal("DELETE");
      expect(policy[artifacts.CLEANUP_POLICY_ID].condition).to.deep.include({
        tagState: "ANY",
        olderThan: "604800s", // 7 days in seconds
      });
    });
  });

  describe("updateRepository", () => {
    let sandbox: sinon.SinonSandbox;
    let updateRepositoryStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      updateRepositoryStub = sandbox.stub(artifactregistry, "updateRepository").resolves();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should call artifactregistry.updateRepository with the correct parameters", async () => {
      const repoUpdate: Partial<artifactregistry.Repository> = {
        name: "projects/my-project/locations/us-central1/repositories/gcf-artifacts",
        labels: { key: "value" },
      };

      await artifacts.updateRepository(repoUpdate);
      expect(updateRepositoryStub).to.have.been.calledOnceWith(repoUpdate);
    });

    it("should handle 403 errors with a descriptive error message", async () => {
      const error = new Error("Permission denied");
      Object.assign(error, { status: 403 });
      updateRepositoryStub.rejects(error);

      const repoUpdate: Partial<artifactregistry.Repository> = {
        name: "projects/my-project/locations/us-central1/repositories/gcf-artifacts",
      };

      try {
        await artifacts.updateRepository(repoUpdate);
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("You don't have permission to update this repository");
        expect(err.message).to.include("Artifact Registry Administrator");
        expect(err.exit).to.equal(1);
      }
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
          [artifacts.CLEANUP_POLICY_ID]: {
            id: artifacts.CLEANUP_POLICY_ID,
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
          [artifacts.CLEANUP_POLICY_ID]: {
            id: artifacts.CLEANUP_POLICY_ID,
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
          [artifacts.CLEANUP_POLICY_ID]: {
            id: artifacts.CLEANUP_POLICY_ID,
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
          [artifacts.CLEANUP_POLICY_ID]: {
            id: artifacts.CLEANUP_POLICY_ID,
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

  describe("hasCleanupOptOut", () => {
    it("should return true if the repository has the opt-out label set to true", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        labels: {
          [artifacts.OPT_OUT_LABEL_KEY]: "true",
          "other-label": "value",
        },
      };

      expect(artifacts.hasCleanupOptOut(repo)).to.be.true;
    });

    it("should return false if the repository has the opt-out label set to a different value", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        labels: {
          [artifacts.OPT_OUT_LABEL_KEY]: "false",
          "other-label": "value",
        },
      };

      expect(artifacts.hasCleanupOptOut(repo)).to.be.false;
    });

    it("should return false if the repository doesn't have the opt-out label", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
        labels: {
          "other-label": "value",
        },
      };

      expect(artifacts.hasCleanupOptOut(repo)).to.be.false;
    });

    it("should return false if the repository has no labels", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
      };

      expect(artifacts.hasCleanupOptOut(repo)).to.be.false;
    });
  });
});
