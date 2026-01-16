import { expect } from "chai";
import { serviceNameFromSchema } from "./schemaMigration";
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
