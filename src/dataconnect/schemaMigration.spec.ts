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
      "Data Connect schema must have a postgres datasource with a database name.",
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
      "Data Connect schema must have a postgres datasource with a CloudSQL instance.",
    );
  });
});
