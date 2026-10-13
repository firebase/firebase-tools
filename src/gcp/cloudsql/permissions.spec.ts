import { expect } from "chai";
import * as sinon from "sinon";
import { ownerRolePermissions, writerRolePermissions, readerRolePermissions } from "./permissions";
import { greenFieldSchemaSetup, grantRoleTo } from "./permissionsSetup";
import { Options } from "../../options";
import * as connect from "./connect";
import * as projectUtils from "../../projectUtils";
import * as cloudSqlAdminClient from "./cloudsqladmin";
import { FirebaseError } from "../../error";

describe("permissions", () => {
  describe("ownerRolePermissions", () => {
    it("should generate correct SQL for owner role setup according to Option A2", () => {
      const sqls = ownerRolePermissions("db1", "firebasesuperuser", "public");

      expect(sqls[0]).to.include(
        'CREATE ROLE "firebaseowner_db1_public" WITH ADMIN "firebasesuperuser" BYPASSRLS',
      );
      expect(sqls[1]).to.equal('REVOKE "firebaseowner_db1_public" FROM "cloudsqlsuperuser"');
      expect(sqls[2]).to.equal('GRANT "cloudsqlsuperuser" TO "firebaseowner_db1_public"');
      expect(sqls[3]).to.equal(
        'CREATE SCHEMA IF NOT EXISTS "public" AUTHORIZATION "firebaseowner_db1_public"',
      );
      expect(sqls[4]).to.equal('ALTER SCHEMA "public" OWNER TO "firebaseowner_db1_public"');

      // Ensure it does not grant firebaseowner to cloudsqlsuperuser
      expect(sqls).to.not.include('GRANT "firebaseowner_db1_public" TO "cloudsqlsuperuser"');
    });
  });

  describe("writerRolePermissions", () => {
    it("should generate BYPASSRLS in role creation script", () => {
      const sqls = writerRolePermissions("db1", "firebasesuperuser", "public");
      expect(sqls[0]).to.include(
        'CREATE ROLE "firebasewriter_db1_public" WITH ADMIN "firebasesuperuser" BYPASSRLS',
      );
    });
  });

  describe("readerRolePermissions", () => {
    it("should generate BYPASSRLS in role creation script", () => {
      const sqls = readerRolePermissions("db1", "firebasesuperuser", "public");
      expect(sqls[0]).to.include(
        'CREATE ROLE "firebasereader_db1_public" WITH ADMIN "firebasesuperuser" BYPASSRLS',
      );
    });
  });
});

describe("permissionsSetup", () => {
  let createUserStub: sinon.SinonStub;
  let executeSqlCmdsAsSuperUserStub: sinon.SinonStub;

  beforeEach(() => {
    sinon
      .stub(connect, "getIAMUser")
      .resolves({ user: "test-user@gcp.iam", mode: "CLOUD_IAM_USER" });
    sinon.stub(projectUtils, "needProjectNumber").resolves("123456789");
    sinon.stub(projectUtils, "needProjectId").returns("test-project");
    createUserStub = sinon.stub(cloudSqlAdminClient, "createUser").resolves();
    executeSqlCmdsAsSuperUserStub = sinon.stub(connect, "executeSqlCmdsAsSuperUser").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("greenFieldSchemaSetup", () => {
    it("should generate greenfield setup SQLs without revoking cloudsqlsuperuser from firebaseowner and with P4SA revokes", async () => {
      const options = {} as Options;
      const sqls = await greenFieldSchemaSetup("instance1", "db1", "public", options);

      // Should not contain REVOKE "cloudsqlsuperuser" FROM "firebaseowner_..."
      const revokeCSQLSuperUser = sqls.find((sql) =>
        sql.includes('REVOKE "cloudsqlsuperuser" FROM "firebaseowner_db1_public"'),
      );
      expect(revokeCSQLSuperUser).to.be.undefined;

      // Should contain REVOKE "firebaseowner_db1_public" FROM P4SA
      const expectedP4SAUser = "service-123456789@gcp-sa-firebasedataconnect.iam";
      expect(sqls).to.include(`REVOKE "firebaseowner_db1_public" FROM "${expectedP4SAUser}"`);
      expect(sqls).to.include(`GRANT "firebasewriter_db1_public" TO "${expectedP4SAUser}"`);
    });
  });

  describe("grantRoleTo", () => {
    it("should throw FirebaseError if attempting to grant owner role to Data Connect P4SA user", async () => {
      const options = {} as Options;
      const p4saEmail = "service-123456789@gcp-sa-firebasedataconnect.iam.gserviceaccount.com";

      await expect(
        grantRoleTo(options, "instance1", "db1", "owner", p4saEmail, "public"),
      ).to.be.rejectedWith(
        FirebaseError,
        /Cannot grant the "owner" role to the Data Connect service agent/,
      );

      expect(createUserStub).to.not.be.called;
      expect(executeSqlCmdsAsSuperUserStub).to.not.be.called;
    });

    it("should allow granting writer role to Data Connect P4SA user", async () => {
      const options = {} as Options;
      const p4saEmail = "service-123456789@gcp-sa-firebasedataconnect.iam.gserviceaccount.com";

      await grantRoleTo(options, "instance1", "db1", "writer", p4saEmail, "public");

      expect(createUserStub).to.be.calledOnce;
      expect(executeSqlCmdsAsSuperUserStub).to.be.calledOnce;
      expect(executeSqlCmdsAsSuperUserStub.firstCall.args[3]).to.deep.equal([
        'GRANT "firebasewriter_db1_public" TO "service-123456789@gcp-sa-firebasedataconnect.iam"',
      ]);
    });
  });
});
