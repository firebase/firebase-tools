import * as experiments from "../experiments";
import * as sinon from "sinon";
import * as client from "./client";
import * as connect from "../gcp/cloudsql/connect";
import * as cloudsqladmin from "../gcp/cloudsql/cloudsqladmin";
import * as permissionsSetup from "../gcp/cloudsql/permissionsSetup";
import { SchemaSetupStatus } from "../gcp/cloudsql/permissionsSetup";
import { handleIncompatibleSchemaError } from "./schemaMigration";
import { expect } from "chai";
import { serviceNameFromSchema, getIdentifiers } from "./schemaMigration";
import { Schema } from "./types";

describe("serviceNameFromSchema", () => {
  it("main schema", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/main",
      datasources: [],
      source: {},
    };
    const serviceName = serviceNameFromSchema(schema);
    expect(serviceName).to.equal("projects/project-id/locations/us-central1/services/service-id");
  });
  it("secondary schema", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/schema-id",
      datasources: [],
      source: {},
    };
    const serviceName = serviceNameFromSchema(schema);
    expect(serviceName).to.equal("projects/project-id/locations/us-central1/services/service-id");
  });
  it("service named schemas", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/schemas/schemas/schema-id",
      datasources: [],
      source: {},
    };
    const serviceName = serviceNameFromSchema(schema);
    expect(serviceName).to.equal("projects/project-id/locations/us-central1/services/schemas");
  });
  it("schema named schemas", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/schemas",
      datasources: [],
      source: {},
    };
    const serviceName = serviceNameFromSchema(schema);
    expect(serviceName).to.equal("projects/project-id/locations/us-central1/services/service-id");
  });
});

describe("getIdentifiers", () => {
  it("should return custom schema name when specified", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/main",
      datasources: [
        {
          postgresql: {
            database: "fdcdb",
            schema: "movies",
            cloudSql: {
              instance: "projects/project-id/locations/us-east4/instances/my-instance",
            },
          },
        },
      ],
      source: {},
    };
    const ids = getIdentifiers(schema);
    expect(ids.schemaName).to.equal("movies");
    expect(ids.databaseId).to.equal("fdcdb");
    expect(ids.instanceId).to.equal("my-instance");
    expect(ids.instanceName).to.equal(
      "projects/project-id/locations/us-east4/instances/my-instance",
    );
    expect(ids.serviceName).to.equal(
      "projects/project-id/locations/us-central1/services/service-id",
    );
  });

  it("should default schemaName to 'public' when not specified", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/main",
      datasources: [
        {
          postgresql: {
            database: "fdcdb",
            cloudSql: {
              instance: "projects/project-id/locations/us-east4/instances/my-instance",
            },
          },
        },
      ],
      source: {},
    };
    const ids = getIdentifiers(schema);
    expect(ids.schemaName).to.equal("public");
  });

  it("should throw if no database is specified", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/main",
      datasources: [
        {
          postgresql: {
            cloudSql: {
              instance: "projects/project-id/locations/us-east4/instances/my-instance",
            },
          },
        },
      ],
      source: {},
    };
    expect(() => getIdentifiers(schema)).to.throw(
      "SQL Connect schema must have a postgres datasource with a database name.",
    );
  });

  it("should throw if no CloudSQL instance is specified", () => {
    const schema: Schema = {
      name: "projects/project-id/locations/us-central1/services/service-id/schemas/main",
      datasources: [
        {
          postgresql: {
            database: "fdcdb",
          },
        },
      ],
      source: {},
    };
    expect(() => getIdentifiers(schema)).to.throw(
      "SQL Connect schema must have a postgres datasource with a CloudSQL instance.",
    );
  });
});

import { performClientSidePreflightValidation } from "./schemaMigration";
import * as sinon from "sinon";
import * as logger from "../logger";

import * as cloudsqladmin from "../gcp/cloudsql/cloudsqladmin";
import * as permissionsSetup from "../gcp/cloudsql/permissionsSetup";
import { SchemaSetupStatus } from "../gcp/cloudsql/permissionsSetup";

describe("handleIncompatibleSchemaError", () => {
  let executeSchemaMigrationStub: sinon.SinonStub;
  let executeSqlCmdsAsIamUserStub: sinon.SinonStub;
  let isEnabledStub: sinon.SinonStub;

  beforeEach(() => {
    executeSchemaMigrationStub = sinon.stub(client, "executeSchemaMigration").resolves();
    executeSqlCmdsAsIamUserStub = sinon.stub(connect, "executeSqlCmdsAsIamUser").resolves();
    sinon.stub(cloudsqladmin, "iamUserIsCSQLAdmin").resolves(true);
    sinon
      .stub(permissionsSetup, "getSchemaMetadata")
      .resolves({ setupStatus: SchemaSetupStatus.GreenField } as any);
    sinon.stub(permissionsSetup, "checkSQLRoleIsGranted").resolves(true);
    sinon.stub(connect, "getIAMUser").resolves({ user: "test-user", mode: "IAM" as any });
    isEnabledStub = sinon.stub(experiments, "isEnabled").returns(false);
  });

  afterEach(() => {
    sinon.restore();
    
  });

  const schema: any = {
    name: "projects/p/locations/l/services/s/schemas/main",
  };

  const incompatibleSchemaError: any = {
    diffs: [
      { sql: "CREATE TABLE a", destructive: false },
      { sql: "DROP TABLE b", destructive: true },
    ],
  };

  it("should execute all commands via IAM user when fdcapimigration experiment is not enabled", async () => {
    isEnabledStub.withArgs("fdcapimigration").returns(false);
    await handleIncompatibleSchemaError({
      schema,
      incompatibleSchemaError,
      options: {} as any,
      instanceId: "instance",
      databaseId: "db",
      schemaName: "public",
      choice: "all",
    });

    expect(executeSqlCmdsAsIamUserStub).to.be.calledOnce;
    expect(executeSchemaMigrationStub).to.not.be.called;

    const args = executeSqlCmdsAsIamUserStub.firstCall.args;
    expect(args[3]).to.deep.equal([
      'SET ROLE "firebaseowner_db_public"',
      "CREATE TABLE a",
      "DROP TABLE b",
    ]);
  });

  it("should execute only safe commands via FDC API when fdcapimigration experiment is enabled and choice is safe", async () => {
    isEnabledStub.withArgs("fdcapimigration").returns(true);
    await handleIncompatibleSchemaError({
      schema,
      incompatibleSchemaError,
      options: {} as any,
      instanceId: "instance",
      databaseId: "db",
      schemaName: "public",
      choice: "safe",
    });

    expect(executeSchemaMigrationStub).to.be.calledOnce;
    expect(executeSqlCmdsAsIamUserStub).to.not.be.called;

    const args = executeSchemaMigrationStub.firstCall.args;
    expect(args[0]).to.equal("projects/p/locations/l/services/s");
    expect(args[1]).to.deep.equal([{ sql: "CREATE TABLE a", destructive: false }]);
  });

  it("should not execute any commands when choice is none", async () => {
    await handleIncompatibleSchemaError({
      schema,
      incompatibleSchemaError,
      options: {} as any,
      instanceId: "instance",
      databaseId: "db",
      schemaName: "public",
      choice: "none",
    });

    expect(executeSchemaMigrationStub).to.not.be.called;
    expect(executeSqlCmdsAsIamUserStub).to.not.be.called;
  });
});
