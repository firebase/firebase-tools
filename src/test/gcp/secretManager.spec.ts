import * as sinon from "sinon";
import { expect } from "chai";

import * as iam from "../../gcp/iam";
import * as secretManager from "../../gcp/secretManager";
import { FirebaseError } from "../../error";
import { ensureServiceAgentRole } from "../../gcp/secretManager";

describe("secretManager", () => {
  describe("parseSecretResourceName", () => {
    it("parses valid secret resource name", () => {
      expect(
        secretManager.parseSecretResourceName("projects/my-project/secrets/my-secret"),
      ).to.deep.equal({ projectId: "my-project", name: "my-secret" });
    });

    it("throws given invalid resource name", () => {
      expect(() => secretManager.parseSecretResourceName("foo/bar")).to.throw(FirebaseError);
    });

    it("throws given incomplete resource name", () => {
      expect(() => secretManager.parseSecretResourceName("projects/my-project")).to.throw(
        FirebaseError,
      );
    });

    it("parse secret version resource name", () => {
      expect(
        secretManager.parseSecretResourceName("projects/my-project/secrets/my-secret/versions/8"),
      ).to.deep.equal({ projectId: "my-project", name: "my-secret" });
    });
  });

  describe("parseSecretVersionResourceName", () => {
    it("parses valid secret resource name", () => {
      expect(
        secretManager.parseSecretVersionResourceName(
          "projects/my-project/secrets/my-secret/versions/7",
        ),
      ).to.deep.equal({ secret: { projectId: "my-project", name: "my-secret" }, versionId: "7" });
    });

    it("throws given invalid resource name", () => {
      expect(() => secretManager.parseSecretVersionResourceName("foo/bar")).to.throw(FirebaseError);
    });

    it("throws given incomplete resource name", () => {
      expect(() => secretManager.parseSecretVersionResourceName("projects/my-project")).to.throw(
        FirebaseError,
      );
    });

    it("throws given secret resource name", () => {
      expect(() =>
        secretManager.parseSecretVersionResourceName("projects/my-project/secrets/my-secret"),
      ).to.throw(FirebaseError);
    });
  });

  describe("ensureServiceAgentRole", () => {
    const projectId = "my-project";
    const secret: secretManager.Secret = { projectId, name: "my-secret" };
    const role = "test-role";

    let getIamPolicyStub: sinon.SinonStub;
    let setIamPolicyStub: sinon.SinonStub;

    beforeEach(() => {
      getIamPolicyStub = sinon.stub(secretManager, "getIamPolicy").rejects("Unexpected call");
      setIamPolicyStub = sinon.stub(secretManager, "setIamPolicy").rejects("Unexpected call");
    });

    afterEach(() => {
      getIamPolicyStub.restore();
      setIamPolicyStub.restore();
    });

    function setupStubs(existing: iam.Binding[], expected?: iam.Binding[]) {
      getIamPolicyStub.withArgs(secret).resolves({ bindings: existing });
      if (expected) {
        setIamPolicyStub.withArgs(secret, expected).resolves({ body: { bindings: expected } });
      }
    }

    it("adds new binding for each member", async () => {
      const existing: iam.Binding[] = [];
      const expected: iam.Binding[] = [
        { role, members: ["serviceAccount:1@foobar.com", "serviceAccount:2@foobar.com"] },
      ];

      setupStubs(existing, expected);
      await ensureServiceAgentRole(secret, ["1@foobar.com", "2@foobar.com"], role);
    });

    it("adds bindings only for missing members", async () => {
      const existing: iam.Binding[] = [{ role, members: ["serviceAccount:1@foobar.com"] }];
      const expected: iam.Binding[] = [
        { role, members: ["serviceAccount:1@foobar.com", "serviceAccount:2@foobar.com"] },
      ];

      setupStubs(existing, expected);
      await ensureServiceAgentRole(secret, ["1@foobar.com", "2@foobar.com"], role);
    });

    it("keeps bindings that already exists", async () => {
      const existing: iam.Binding[] = [
        { role: "another-role", members: ["serviceAccount:3@foobar.com"] },
      ];
      const expected: iam.Binding[] = [
        {
          role: "another-role",
          members: ["serviceAccount:3@foobar.com"],
        },
        {
          role,
          members: ["serviceAccount:1@foobar.com", "serviceAccount:2@foobar.com"],
        },
      ];

      setupStubs(existing, expected);
      await ensureServiceAgentRole(secret, ["1@foobar.com", "2@foobar.com"], role);
    });

    it("does nothing if the binding already exists", async () => {
      const existing: iam.Binding[] = [{ role, members: ["serviceAccount:1@foobar.com"] }];

      setupStubs(existing);
      await ensureServiceAgentRole(secret, ["1@foobar.com"], role);
    });
  });
});
