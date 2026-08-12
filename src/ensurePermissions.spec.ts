import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseError } from "./error";
import { configstore } from "./configstore";
import * as resourceManager from "./gcp/resourceManager";
import * as iam from "./gcp/iam";
import { ensurePermissionsOrSetRole } from "./ensurePermissions";
import * as utils from "./utils";

describe("ensurePermissionsOrSetRole", () => {
  let sandbox: sinon.SinonSandbox;
  let getIamPolicyStub: sinon.SinonStub;
  let setIamPolicyStub: sinon.SinonStub;
  let testIamPermissionsStub: sinon.SinonStub;
  let cacheStore: Record<string, any>;

  const mockPermissions = [
    "mcp.tools.call",
    "resourcemanager.projects.get",
    "resourcemanager.projects.list",
  ];
  const mockRole = "roles/mcp.toolUser";

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getIamPolicyStub = sandbox.stub(resourceManager, "getIamPolicy");
    setIamPolicyStub = sandbox.stub(resourceManager, "setIamPolicy");
    testIamPermissionsStub = sandbox.stub(iam, "testIamPermissions");
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

  it("should succeed and cache positive check if permissions are already held", async () => {
    testIamPermissionsStub.resolves({
      passed: true,
      allowed: mockPermissions,
      missing: [],
    });

    await ensurePermissionsOrSetRole("test-project", "test@example.com", mockPermissions, mockRole);

    expect(testIamPermissionsStub).to.have.been.calledOnceWith("test-project", mockPermissions);
    expect(getIamPolicyStub).to.not.have.been.called;
    expect(cacheStore["iamPermissionCache"]).to.deep.equal({
      "test-project": {
        "test@example.com": {
          "mcp.tools.call": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.get": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.list": { valid: true, timestamp: 1710000000000 },
        },
      },
    });
  });

  it("should skip API call and succeed if permissions are cached and not expired", async () => {
    cacheStore["iamPermissionCache"] = {
      "test-project": {
        "test@example.com": {
          "mcp.tools.call": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.get": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.list": { valid: true, timestamp: 1710000000000 },
        },
      },
    };

    await ensurePermissionsOrSetRole("test-project", "test@example.com", mockPermissions, mockRole);

    expect(testIamPermissionsStub).to.not.have.been.called;
    expect(getIamPolicyStub).to.not.have.been.called;
  });

  it("should skip API call and succeed if legacy boolean permissions are cached", async () => {
    cacheStore["iamPermissionCache"] = {
      "test-project": {
        "test@example.com": {
          "mcp.tools.call": true,
          "resourcemanager.projects.get": true,
          "resourcemanager.projects.list": true,
        },
      },
    };

    await ensurePermissionsOrSetRole("test-project", "test@example.com", mockPermissions, mockRole);

    expect(testIamPermissionsStub).to.not.have.been.called;
  });

  it("should query API if cached permissions have expired", async () => {
    const now = 1710000000000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000 - 1000; // expired by 1 second
    cacheStore["iamPermissionCache"] = {
      "test-project": {
        "test@example.com": {
          "mcp.tools.call": { valid: true, timestamp: oneDayAgo },
          "resourcemanager.projects.get": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.list": { valid: true, timestamp: 1710000000000 },
        },
      },
    };
    testIamPermissionsStub.resolves({
      passed: true,
      allowed: mockPermissions,
      missing: [],
    });

    await ensurePermissionsOrSetRole("test-project", "test@example.com", mockPermissions, mockRole);

    expect(testIamPermissionsStub).to.have.been.calledOnceWith("test-project", mockPermissions);
  });

  it("should query API even if cached when force is true", async () => {
    cacheStore["iamPermissionCache"] = {
      "test-project": {
        "test@example.com": {
          "mcp.tools.call": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.get": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.list": { valid: true, timestamp: 1710000000000 },
        },
      },
    };
    testIamPermissionsStub.resolves({
      passed: true,
      allowed: mockPermissions,
      missing: [],
    });

    await ensurePermissionsOrSetRole(
      "test-project",
      "test@example.com",
      mockPermissions,
      mockRole,
      true,
    );

    expect(testIamPermissionsStub).to.have.been.calledOnceWith("test-project", mockPermissions);
  });

  it("should attempt to bind role and succeed/cache if testIamPermissions fails but setIamPolicy succeeds", async () => {
    testIamPermissionsStub.resolves({
      passed: false,
      allowed: [],
      missing: mockPermissions,
    });
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: "roles/viewer",
          members: ["user:test@example.com"],
        },
      ],
    });
    setIamPolicyStub.resolves({} as any);

    await ensurePermissionsOrSetRole("test-project", "test@example.com", mockPermissions, mockRole);

    expect(setIamPolicyStub).to.have.been.calledOnce;
    expect(cacheStore["iamPermissionCache"]).to.deep.equal({
      "test-project": {
        "test@example.com": {
          "mcp.tools.call": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.get": { valid: true, timestamp: 1710000000000 },
          "resourcemanager.projects.list": { valid: true, timestamp: 1710000000000 },
        },
      },
    });
  });

  it("should throw FirebaseError with instructions if testIamPermissions fails and setIamPolicy fails", async () => {
    testIamPermissionsStub.resolves({
      passed: false,
      allowed: [],
      missing: mockPermissions,
    });
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
      ensurePermissionsOrSetRole("test-project", "test@example.com", mockPermissions, mockRole),
    ).to.be.rejectedWith(
      FirebaseError,
      /Attempted to automatically bind the role roles\/mcp\.toolUser but failed/,
    );

    expect(cacheStore["iamPermissionCache"]).to.be.undefined;
  });

  it("should resolve serviceAccount prefix correctly when checking policy bindings", async () => {
    testIamPermissionsStub.resolves({
      passed: false,
      allowed: [],
      missing: mockPermissions,
    });
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: mockRole,
          members: ["serviceAccount:sa@proj.iam.gserviceaccount.com"],
        },
      ],
    });

    await ensurePermissionsOrSetRole(
      "test-project",
      "sa@proj.iam.gserviceaccount.com",
      mockPermissions,
      mockRole,
    );

    expect(getIamPolicyStub).to.have.been.calledOnce;
    expect(setIamPolicyStub).to.not.have.been.called;
  });

  it("should resolve user prefix correctly even if email contains gserviceaccount.com as a substring", async () => {
    testIamPermissionsStub.resolves({
      passed: false,
      allowed: [],
      missing: mockPermissions,
    });
    getIamPolicyStub.resolves({
      bindings: [
        {
          role: mockRole,
          members: ["user:sa@proj.iam.gserviceaccount.com.fake.com"],
        },
      ],
    });

    await ensurePermissionsOrSetRole(
      "test-project",
      "sa@proj.iam.gserviceaccount.com.fake.com",
      mockPermissions,
      mockRole,
    );

    expect(getIamPolicyStub).to.have.been.calledOnce;
    expect(setIamPolicyStub).to.not.have.been.called;
  });

  it("should use customLogger for debugging if provided", async () => {
    testIamPermissionsStub.resolves({
      passed: true,
      allowed: mockPermissions,
      missing: [],
    });
    const customLogger = {
      debug: sandbox.stub(),
    };

    await ensurePermissionsOrSetRole(
      "test-project",
      "test@example.com",
      mockPermissions,
      mockRole,
      false,
      customLogger,
    );

    expect(customLogger.debug).to.have.been.calledWith(
      sinon.match(/ensurePermissionsOrSetRole called/),
    );
    expect(customLogger.debug).to.have.been.calledWith(
      sinon.match(/Caching positive permissions check/),
    );
  });
});
