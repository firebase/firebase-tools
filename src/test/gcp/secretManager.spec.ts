import * as sinon from "sinon";
import { expect } from "chai";

import * as api from "../../api";
import * as secretManager from "../../gcp/secretManager";
import { FirebaseError } from "../../error";
import { ensureServiceAgentRole } from "../../gcp/secretManager";

describe("parseSecretResourceName", () => {
  it("parses valid secret resource name", () => {
    expect(
      secretManager.parseSecretResourceName("projects/my-project/secrets/my-secret")
    ).to.deep.equal({ projectId: "my-project", name: "my-secret" });
  });

  it("throws given invalid resource name", () => {
    expect(() => {
      secretManager.parseSecretResourceName("foo/bar");
    }).to.throw(FirebaseError);
  });

  it("throws given incomplete resource name", () => {
    expect(() => {
      secretManager.parseSecretResourceName("projects/my-project");
    }).to.throw(FirebaseError);
  });

  it("parse secret version resource name", () => {
    expect(
      secretManager.parseSecretResourceName("projects/my-project/secrets/my-secret/versions/8")
    ).to.deep.equal({ projectId: "my-project", name: "my-secret" });
  });
});

describe("parseSecretVersionResourceName", () => {
  it("parses valid secret resource name", () => {
    expect(
      secretManager.parseSecretVersionResourceName(
        "projects/my-project/secrets/my-secret/versions/7"
      )
    ).to.deep.equal({ secret: { projectId: "my-project", name: "my-secret" }, versionId: "7" });
  });

  it("throws given invalid resource name", () => {
    expect(() => {
      secretManager.parseSecretVersionResourceName("foo/bar");
    }).to.throw(FirebaseError);
  });

  it("throws given incomplete resource name", () => {
    expect(() => {
      secretManager.parseSecretVersionResourceName("projects/my-project");
    }).to.throw(FirebaseError);
  });

  it("throws given secret resource name", () => {
    expect(() => {
      secretManager.parseSecretVersionResourceName("projects/my-project/secrets/my-secret");
    }).to.throw(FirebaseError);
  });
});

describe("ensureServiceAgentRole", () => {
  const projectId = "my-project";
  const secret: secretManager.Secret = { projectId, name: "my-secret" };
  const role = "test-role";

  let mockApi: sinon.SinonMock;

  beforeEach(() => {
    mockApi = sinon.mock(api);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  function mockGetIamPolicy(bindings: any) {
    mockApi
      .expects("request")
      .withArgs(
        "GET",
        `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`
      )
      .once()
      .resolves({
        body: { bindings },
      });
  }

  function mockSetIamPolicy(bindings: any) {
    mockApi
      .expects("request")
      .withArgs(
        "POST",
        `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
        {
          auth: true,
          origin: api.secretManagerOrigin,
          data: {
            policy: {
              bindings,
            },
            updateMask: {
              paths: "bindings",
            },
          },
        }
      )
      .once()
      .resolves({
        body: { bindings },
      });
  }

  it("adds new binding for each member", async () => {
    mockGetIamPolicy([]);
    mockSetIamPolicy([
      { role: "a-role", members: ["serviceAccount:1@foobar.com"] },
      { role: "a-role", members: ["serviceAccount:2@foobar.com"] },
    ]);

    await ensureServiceAgentRole(secret, ["1@foobar.com", "2@foobar.com"], "a-role");
  });

  it("adds bindings only for missing members", async () => {
    mockGetIamPolicy([{ role: "a-role", members: ["serviceAccount:1@foobar.com"] }]);
    mockSetIamPolicy([
      { role: "a-role", members: ["serviceAccount:1@foobar.com"] },
      { role: "a-role", members: ["serviceAccount:2@foobar.com"] },
    ]);

    await ensureServiceAgentRole(secret, ["1@foobar.com", "2@foobar.com"], "a-role");
  });

  it("keeps bindings that already exists", async () => {
    mockGetIamPolicy([{ role: "another-role", members: ["serviceAccount:3@foobar.com"] }]);
    mockSetIamPolicy([
      { role: "another-role", members: ["serviceAccount:3@foobar.com"] },
      { role: "a-role", members: ["serviceAccount:1@foobar.com"] },
      { role: "a-role", members: ["serviceAccount:2@foobar.com"] },
    ]);

    await ensureServiceAgentRole(secret, ["1@foobar.com", "2@foobar.com"], "a-role");
  });

  it("does nothing if the binding already exists", async () => {
    mockGetIamPolicy([{ role: "a-role", members: ["serviceAccount:1@foobar.com"] }]);
    // Note: Don't call mockSetIamPolicy - we don't expect to call setIamPolicy.

    await ensureServiceAgentRole(secret, ["1@foobar.com"], "a-role");
  });
});
