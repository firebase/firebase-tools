import { expect } from "chai";
import * as sinon from "sinon";

import * as artifactregistry from "../gcp/artifactregistry";
import { FirebaseError } from "../error";
import * as artifacts from "./artifacts";

describe("functions/artifacts", () => {
  let sandbox: sinon.SinonSandbox;
  let patchRepositoryStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    patchRepositoryStub = sandbox.stub(artifactregistry, "patchRepository").resolves();
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

      const policy = artifacts.findExistingPolicy(repo, "policy-id");
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

      const policy = artifacts.findExistingPolicy(repo, "policy-id");
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

      const policy = artifacts.findExistingPolicy(repo, "policy-id");
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

  describe("parseSecondsFromPolicy", () => {
    it("should correctly parse seconds into days", () => {
      expect(artifacts.parseSecondsFromPolicy("86400s")).to.equal(86400);
      expect(artifacts.parseSecondsFromPolicy("432000s")).to.equal(43200);
      expect(artifacts.parseSecondsFromPolicy("2592000s")).to.equal(2592000);
    });

    it("should return undefined for invalid formats", () => {
      expect(artifacts.parseSecondsFromPolicy("5d")).to.be.undefined;
      expect(artifacts.parseSecondsFromPolicy("invalid")).to.be.undefined;
      expect(artifacts.parseSecondsFromPolicy("")).to.be.undefined;
    });
  });

  describe("createCleanupPolicyPatch", () => {
    it("should create a valid patch request", () => {
      const patch = artifacts.createCleanupPolicyPatch("test-policy", 7);

      expect(patch).to.deep.equal({
        cleanupPolicies: {
          "test-policy": {
            id: "test-policy",
            action: "DELETE",
            condition: {
              tagState: "ANY",
              olderThan: "604800s", // 7 days in seconds
            },
          },
        },
      });
    });
  });

  describe("applyCleanupPolicy", () => {
    const REPO_PATH = "projects/my-project/locations/us-central1/repositories/gcf-artifacts";

    it("should throw an error if days is not a positive number", async () => {
      try {
        await artifacts.applyCleanupPolicy(REPO_PATH, -1);
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as FirebaseError;
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.contain("Days must be a positive number");
      }

      try {
        await artifacts.applyCleanupPolicy(REPO_PATH, NaN);
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as FirebaseError;
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.contain("Days must be a positive number");
      }
    });

    it("should call patchRepository with correct parameters", async () => {
      await artifacts.applyCleanupPolicy(REPO_PATH, 10);

      expect(patchRepositoryStub).to.have.been.calledWith(
        REPO_PATH,
        {
          cleanupPolicies: {
            [artifacts.CLEANUP_POLICY_ID]: {
              id: artifacts.CLEANUP_POLICY_ID,
              action: "DELETE",
              condition: {
                tagState: "ANY",
                olderThan: "864000s", // 10 days in seconds
              },
            },
          },
        },
        "cleanupPolicies",
      );
    });

    it("should handle permission errors", async () => {
      patchRepositoryStub.rejects({ status: 403 } as any);

      try {
        await artifacts.applyCleanupPolicy(REPO_PATH, 5);
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as FirebaseError;
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.contain("You don't have permission");
      }
    });

    it("should handle other errors", async () => {
      patchRepositoryStub.rejects(new Error("Some API error"));

      try {
        await artifacts.applyCleanupPolicy(REPO_PATH, 5);
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as FirebaseError;
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.contain("Failed to set up artifact registry cleanup policy");
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

      expect(artifacts.hasSameCleanupPolicy(repo, "test-policy", 5)).to.be.true;
    });

    it("should return false if policy doesn't exist", () => {
      const repo: artifactregistry.Repository = {
        name: "test-repo",
        format: "DOCKER",
        description: "Test repo",
        createTime: "",
        updateTime: "",
      };

      expect(artifacts.hasSameCleanupPolicy(repo, "test-policy", 5)).to.be.false;
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

      expect(artifacts.hasSameCleanupPolicy(repo, "test-policy", 5)).to.be.false;
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

      expect(artifacts.hasSameCleanupPolicy(repo, "test-policy", 5)).to.be.false;
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

      expect(artifacts.hasSameCleanupPolicy(repo, "test-policy", 5)).to.be.false;
    });
  });
});
