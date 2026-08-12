import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseError } from "./error";
import { configstore } from "./configstore";
import * as resourceManager from "./gcp/resourceManager";
import { ensureRole } from "./ensureRoleBound";
import * as utils from "./utils";

describe("ensureRole", () => {
  let sandbox: sinon.SinonSandbox;
  let getIamPolicyStub: sinon.SinonStub;
  let setIamPolicyStub: sinon.SinonStub;
  let cacheStore: Record<string, any>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getIamPolicyStub = sandbox.stub(resourceManager, "getIamPolicy");
    setIamPolicyStub = sandbox.stub(resourceManager, "setIamPolicy");
    sandbox.stub(utils, "sleep").resolves();
    sandbox.stub(Date, "now").returns(1710000000000);

    cacheStore = {};
    sandbox.stub(configstore, "get").callsFake((key: string) => cacheStore[key]);
    (sandbox.stub(configstore, "set") as any).callsFake((key: string, val: any) => {
      cacheStore[key] = val;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should succeed and cache positive check if role binding exists", async () => {
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/mcp.toolUser",
          members: ["user:test@example.com"],
        },
      ],
    });

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser");

    expect(getIamPolicyStub).to.have.been.calledOnceWith("test-project");
    expect(cacheStore["iamRoleCache"]).to.deep.equal({
      "test-project": {
        "test@example.com": {
          "roles/mcp.toolUser": {
            valid: true,
            timestamp: 1710000000000,
          },
        },
      },
    });
  });

  it("should skip API call and succeed if role is cached and not expired", async () => {
    cacheStore["iamRoleCache"] = {
      "test-project": {
        "test@example.com": {
          "roles/mcp.toolUser": {
            valid: true,
            timestamp: 1710000000000,
          },
        },
      },
    };

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser");

    expect(getIamPolicyStub).to.not.have.been.called;
  });

  it("should skip API call and succeed if legacy boolean role is cached", async () => {
    cacheStore["iamRoleCache"] = {
      "test-project": {
        "test@example.com": {
          "roles/mcp.toolUser": true,
        },
      },
    };

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser");

    expect(getIamPolicyStub).to.not.have.been.called;
  });

  it("should query API if cached role has expired", async () => {
    const now = 1710000000000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000 - 1000; // expired by 1 second
    cacheStore["iamRoleCache"] = {
      "test-project": {
        "test@example.com": {
          "roles/mcp.toolUser": {
            valid: true,
            timestamp: oneDayAgo,
          },
        },
      },
    };
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/mcp.toolUser",
          members: ["user:test@example.com"],
        },
      ],
    });

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser");

    expect(getIamPolicyStub).to.have.been.calledOnceWith("test-project");
  });

  it("should query API even if cached when force is true", async () => {
    cacheStore["iamRoleCache"] = {
      "test-project": {
        "test@example.com": {
          "roles/mcp.toolUser": {
            valid: true,
            timestamp: 1710000000000,
          },
        },
      },
    };
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/mcp.toolUser",
          members: ["user:test@example.com"],
        },
      ],
    });

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser", true);

    expect(getIamPolicyStub).to.have.been.calledOnceWith("test-project");
  });

  it("should attempt to bind role and succeed/cache if setIamPolicy succeeds", async () => {
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/viewer",
          members: ["user:test@example.com"],
        },
      ],
    });
    setIamPolicyStub.resolves({} as any);

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser");

    expect(setIamPolicyStub).to.have.been.calledOnce;
    expect(cacheStore["iamRoleCache"]).to.deep.equal({
      "test-project": {
        "test@example.com": {
          "roles/mcp.toolUser": {
            valid: true,
            timestamp: 1710000000000,
          },
        },
      },
    });
  });

  it("should throw FirebaseError with instructions if setIamPolicy fails", async () => {
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/viewer",
          members: ["user:test@example.com"],
        },
      ],
    });
    setIamPolicyStub.rejects(new Error("Permission denied"));

    await expect(
      ensureRole("test-project", "test@example.com", "roles/mcp.toolUser"),
    ).to.be.rejectedWith(
      FirebaseError,
      /Attempted to automatically bind the role but failed[\s\S]*gcloud beta projects add-iam-policy-binding/,
    );

    expect(cacheStore["iamRoleCache"]).to.be.undefined;
  });

  it("should resolve serviceAccount prefix correctly", async () => {
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/mcp.toolUser",
          members: ["serviceAccount:sa@proj.iam.gserviceaccount.com"],
        },
      ],
    });

    await ensureRole("test-project", "sa@proj.iam.gserviceaccount.com", "roles/mcp.toolUser");

    expect(getIamPolicyStub).to.have.been.calledOnce;
  });

  it("should resolve user prefix correctly even if email contains gserviceaccount.com as a substring", async () => {
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/mcp.toolUser",
          members: ["user:sa@proj.iam.gserviceaccount.com.fake.com"],
        },
      ],
    });

    await ensureRole(
      "test-project",
      "sa@proj.iam.gserviceaccount.com.fake.com",
      "roles/mcp.toolUser",
    );

    expect(getIamPolicyStub).to.have.been.calledOnce;
  });

  it("should use customLogger for debugging if provided", async () => {
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/mcp.toolUser",
          members: ["user:test@example.com"],
        },
      ],
    });
    const customLogger = {
      debug: sandbox.stub(),
    };

    await ensureRole("test-project", "test@example.com", "roles/mcp.toolUser", false, customLogger);

    expect(customLogger.debug).to.have.been.calledWith(sinon.match(/ensureRole called/));
    expect(customLogger.debug).to.have.been.calledWith(sinon.match(/Caching positive role check/));
  });
});
