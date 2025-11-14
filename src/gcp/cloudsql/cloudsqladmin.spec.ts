import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import * as sqladmin from "../../gcp/cloudsql/cloudsqladmin";
import * as iam from "../../gcp/iam";
import { cloudSQLAdminOrigin } from "../../api";
import { Options } from "../../options";
import * as operationPoller from "../../operation-poller";
import { Config } from "../../config";
import { RC } from "../../rc";

const PROJECT_ID = "test-project";
const INSTANCE_ID = "test-instance";
const DATABASE_ID = "test-database";
const USERNAME = "test-user";
const API_VERSION = "v1";

const options: Options = {
  project: PROJECT_ID,
  auth: true,
  cwd: "",
  configPath: "",
  only: "",
  except: "",
  config: new Config({}, { projectDir: "", cwd: "" }),
  filteredTargets: [],
  force: false,
  nonInteractive: false,
  debug: false,
  rc: new RC(),
};

describe("cloudsqladmin", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("iamUserIsCSQLAdmin", () => {
    it("should return true if user has required permissions", async () => {
      sandbox.stub(iam, "testIamPermissions").resolves({ allowed: [], missing: [], passed: true });
      const result = await sqladmin.iamUserIsCSQLAdmin(options);
      expect(result).to.be.true;
    });

    it("should return false if user does not have required permissions", async () => {
      sandbox
        .stub(iam, "testIamPermissions")
        .resolves({ allowed: [], missing: ["p1"], passed: false });
      const result = await sqladmin.iamUserIsCSQLAdmin(options);
      expect(result).to.be.false;
    });

    it("should return false on IAM error", async () => {
      sandbox.stub(iam, "testIamPermissions").rejects(new Error("IAM error"));
      const result = await sqladmin.iamUserIsCSQLAdmin(options);
      expect(result).to.be.false;
    });
  });

  describe("listInstances", () => {
    it("should return a list of instances on success", async () => {
      const instances = [{ name: INSTANCE_ID }];
      nock(cloudSQLAdminOrigin())
        .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances`)
        .reply(200, { items: instances });

      const result = await sqladmin.listInstances(PROJECT_ID);
      expect(result).to.deep.equal(instances);
      expect(nock.isDone()).to.be.true;
    });

    it("should handle allowlist error", async () => {
      nock(cloudSQLAdminOrigin())
        .post(`/${API_VERSION}/projects/${PROJECT_ID}/instances`)
        .reply(400, {
          error: {
            message: "Not allowed to set system label: firebase-data-connect",
          },
        });

      await expect(
        sqladmin.createInstance({
          projectId: PROJECT_ID,
          location: "us-central",
          instanceId: INSTANCE_ID,
          enableGoogleMlIntegration: false,
          freeTrialLabel: "nt",
        }),
      ).to.be.rejectedWith("Cloud SQL free trial instances are not yet available in us-central");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getInstance", () => {
    it("should return an instance on success", async () => {
      const instance = { name: INSTANCE_ID, state: "RUNNABLE" };
      nock(cloudSQLAdminOrigin())
        .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200, instance);

      const result = await sqladmin.getInstance(PROJECT_ID, INSTANCE_ID);
      expect(result).to.deep.equal(instance);
      expect(nock.isDone()).to.be.true;
    });

    it("should update an instance with google ml integration", async () => {
      const instance = {
        name: INSTANCE_ID,
        project: PROJECT_ID,
        settings: { databaseFlags: [] },
      };
      const op = { name: "op-name", status: "DONE" };
      nock(cloudSQLAdminOrigin())
        .patch(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200, op);
      sandbox.stub(operationPoller, "pollOperation").resolves(instance);

      const result = await sqladmin.updateInstanceForDataConnect(instance as any, true);

      expect(result).to.deep.equal(instance);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw if instance is in a failed state", async () => {
      const instance = { name: INSTANCE_ID, state: "FAILED" };
      nock(cloudSQLAdminOrigin())
        .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200, instance);

      await expect(sqladmin.getInstance(PROJECT_ID, INSTANCE_ID)).to.be.rejected;
    });
  });

  describe("instanceConsoleLink", () => {
    it("should return the correct console link", () => {
      const link = sqladmin.instanceConsoleLink(PROJECT_ID, INSTANCE_ID);
      expect(link).to.equal(
        `https://console.cloud.google.com/sql/instances/${INSTANCE_ID}/overview?project=${PROJECT_ID}`,
      );
    });
  });

  describe("createInstance", () => {
    it("should create an instance", async () => {
      nock(cloudSQLAdminOrigin())
        .post(`/${API_VERSION}/projects/${PROJECT_ID}/instances`)
        .reply(200, {});

      await sqladmin.createInstance({
        projectId: PROJECT_ID,
        location: "us-central",
        instanceId: INSTANCE_ID,
        enableGoogleMlIntegration: false,
        freeTrialLabel: "nt",
      });

      expect(nock.isDone()).to.be.true;
    });
  });

  describe("updateInstanceForDataConnect", () => {
    it("should update an instance", async () => {
      const instance = {
        name: INSTANCE_ID,
        project: PROJECT_ID,
        settings: { databaseFlags: [] },
      };
      const op = { name: "op-name", status: "DONE" };
      nock(cloudSQLAdminOrigin())
        .patch(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
        .reply(200, op);
      sandbox.stub(operationPoller, "pollOperation").resolves(instance);

      const result = await sqladmin.updateInstanceForDataConnect(instance as any, false);

      expect(result).to.deep.equal(instance);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("Databases", () => {
    it("should list databases", async () => {
      const databases = [{ name: DATABASE_ID }];
      nock(cloudSQLAdminOrigin())
        .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/databases`)
        .reply(200, { items: databases });

      const result = await sqladmin.listDatabases(PROJECT_ID, INSTANCE_ID);
      expect(result).to.deep.equal(databases);
      expect(nock.isDone()).to.be.true;
    });

    it("should get a database", async () => {
      const database = { name: DATABASE_ID };
      nock(cloudSQLAdminOrigin())
        .get(
          `/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/databases/${DATABASE_ID}`,
        )
        .reply(200, database);

      const result = await sqladmin.getDatabase(PROJECT_ID, INSTANCE_ID, DATABASE_ID);
      expect(result).to.deep.equal(database);
      expect(nock.isDone()).to.be.true;
    });

    it("should create a database", async () => {
      const op = { name: "op-name", status: "DONE" };
      const database = { name: DATABASE_ID };
      nock(cloudSQLAdminOrigin())
        .post(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/databases`)
        .reply(200, op);
      sandbox.stub(operationPoller, "pollOperation").resolves(database);

      const result = await sqladmin.createDatabase(PROJECT_ID, INSTANCE_ID, DATABASE_ID);
      expect(result).to.deep.equal(database);
      expect(nock.isDone()).to.be.true;
    });

    it("should delete a database", async () => {
      const database = { name: DATABASE_ID };
      nock(cloudSQLAdminOrigin())
        .delete(
          `/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/databases/${DATABASE_ID}`,
        )
        .reply(200, database);

      const result = await sqladmin.deleteDatabase(PROJECT_ID, INSTANCE_ID, DATABASE_ID);
      expect(result).to.deep.equal(database);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("Users", () => {
    it("should create a user", async () => {
      const op = { name: "op-name", status: "DONE" };
      const user = { name: USERNAME };
      nock(cloudSQLAdminOrigin())
        .post(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users`)
        .reply(200, op);
      sandbox.stub(operationPoller, "pollOperation").resolves(user);

      const result = await sqladmin.createUser(PROJECT_ID, INSTANCE_ID, "BUILT_IN", USERNAME);
      expect(result).to.deep.equal(user);
      expect(nock.isDone()).to.be.true;
    });

    it("should retry creating a user if built-in role is not ready", async () => {
      const op = { name: "op-name", status: "DONE" };
      const user = { name: USERNAME };
      nock(cloudSQLAdminOrigin())
        .post(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users`)
        .reply(400, {
          error: {
            message: "cloudsqliamuser",
          },
        });
      nock(cloudSQLAdminOrigin())
        .post(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users`)
        .reply(200, op);
      sandbox.stub(operationPoller, "pollOperation").resolves(user);

      const result = await sqladmin.createUser(
        PROJECT_ID,
        INSTANCE_ID,
        "BUILT_IN",
        USERNAME,
        undefined,
        1,
      );

      expect(result).to.deep.equal(user);
      expect(nock.isDone()).to.be.true;
    });

    it("should get a user", async () => {
      const user = { name: USERNAME };
      nock(cloudSQLAdminOrigin())
        .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users/${USERNAME}`)
        .reply(200, user);

      const result = await sqladmin.getUser(PROJECT_ID, INSTANCE_ID, USERNAME);
      expect(result).to.deep.equal(user);
      expect(nock.isDone()).to.be.true;
    });

    it("should delete a user", async () => {
      const user = { name: USERNAME };
      nock(cloudSQLAdminOrigin())
        .delete(
          `/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users?name=${USERNAME}`,
        )
        .reply(200, user);

      const result = await sqladmin.deleteUser(PROJECT_ID, INSTANCE_ID, USERNAME);
      expect(result).to.deep.equal(user);
      expect(nock.isDone()).to.be.true;
    });

    it("should list users", async () => {
      const users = [{ name: USERNAME }];
      nock(cloudSQLAdminOrigin())
        .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users`)
        .reply(200, { items: users });

      const result = await sqladmin.listUsers(PROJECT_ID, INSTANCE_ID);
      expect(result).to.deep.equal(users);
      expect(nock.isDone()).to.be.true;
    });
  });
});
