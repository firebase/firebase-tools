import * as chai from "chai";
import * as sinon from "sinon";
import { expect } from "chai";
import * as apiv2 from "../apiv2";
import * as operationPoller from "../operation-poller";
import * as client from "./client";
import { FirebaseError } from "../error";
import * as types from "./types";

chai.use(require("chai-as-promised"));

describe("client", () => {
  let sandbox: sinon.SinonSandbox;
  let getStub: sinon.SinonStub;
  let postStub: sinon.SinonStub;
  let deleteStub: sinon.SinonStub;
  let patchStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getStub = sandbox.stub();
    postStub = sandbox.stub();
    deleteStub = sandbox.stub();
    patchStub = sandbox.stub();
    sandbox.stub(apiv2, "Client").returns({
      get: getStub,
      post: postStub,
      delete: deleteStub,
      patch: patchStub,
    });
    pollOperationStub = sandbox.stub(operationPoller, "pollOperation");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("listLocations", () => {
    it("should list locations", async () => {
      getStub.resolves({
        body: {
          locations: [{ locationId: "us-central1" }, { locationId: "us-east1" }],
        },
      });

      const locations = await client.listLocations("project");

      expect(locations).to.deep.equal(["us-central1", "us-east1"]);
      expect(getStub).to.be.calledWith("/projects/project/locations");
    });

    it("should return empty list if no locations", async () => {
      getStub.resolves({ body: {} });

      const locations = await client.listLocations("project");

      expect(locations).to.deep.equal([]);
    });
  });

  describe("Service methods", () => {
    it("getService", async () => {
      getStub.resolves({ body: { name: "service" } });

      const service = await client.getService("projects/p/locations/l/services/s");

      expect(service).to.deep.equal({ name: "service" });
      expect(getStub).to.be.calledWith("projects/p/locations/l/services/s");
    });

    it("listAllServices", async () => {
      getStub.resolves({ body: { services: [{ name: "s1" }, { name: "s2" }] } });
      const services = await client.listAllServices("project");
      expect(services).to.deep.equal([{ name: "s1" }, { name: "s2" }]);
      expect(getStub).to.be.calledWith("/projects/project/locations/-/services");
    });

    it("createService", async () => {
      postStub.resolves({ body: { name: "op-name" } });
      pollOperationStub.resolves({ name: "service" });

      const service = await client.createService("p", "l", "s");

      expect(service).to.deep.equal({ name: "service" });
      expect(postStub).to.be.calledWith(
        "/projects/p/locations/l/services",
        { name: "projects/p/locations/l/services/s" },
        { queryParams: { service_id: "s" } },
      );
      expect(pollOperationStub).to.be.calledWith({
        apiOrigin: "https://firebasedataconnect.googleapis.com",
        apiVersion: "v1",
        operationResourceName: "op-name",
      });
    });

    it("createService returns undefined if service already exists", async () => {
      postStub.rejects(new FirebaseError("err", { status: 409 }));

      const service = await client.createService("p", "l", "s");

      expect(service).to.be.undefined;
    });

    it("deleteService", async () => {
      deleteStub.resolves({ body: { name: "op-name" } });
      pollOperationStub.resolves({ name: "service" });

      const service = await client.deleteService("projects/p/locations/l/services/s");

      expect(service).to.deep.equal({ name: "service" });
      expect(deleteStub).to.be.calledWith("projects/p/locations/l/services/s", {
        queryParams: { force: "true" },
      });
    });
  });

  describe("Schema methods", () => {
    it("getSchema", async () => {
      getStub.resolves({ body: { name: "schema" } });
      const schema = await client.getSchema("projects/p/locations/l/services/s");
      expect(schema).to.deep.equal({ name: "schema" });
      expect(getStub).to.be.calledWith("projects/p/locations/l/services/s/schemas/main");
    });

    it("getSchema with schemaId", async () => {
      getStub.resolves({ body: { name: "schema" } });
      const schema = await client.getSchema("projects/p/locations/l/services/s", "schemaId");
      expect(schema).to.deep.equal({ name: "schema" });
      expect(getStub).to.be.calledWith("projects/p/locations/l/services/s/schemas/schemaId");
    });

    it("getSchema returns undefined if not found", async () => {
      getStub.rejects(new FirebaseError("err", { status: 404 }));
      const schema = await client.getSchema("projects/p/locations/l/services/s");
      expect(schema).to.be.undefined;
    });

    it("listSchemas", async () => {
      getStub.onFirstCall().resolves({
        body: { schemas: [{ name: "s1" }], nextPageToken: "next" },
      });
      getStub.onSecondCall().resolves({
        body: { schemas: [{ name: "s2" }] },
      });
      const schemas = await client.listSchemas("projects/p/locations/l/services/s");
      expect(schemas).to.deep.equal([{ name: "s1" }, { name: "s2" }]);
    });

    it("upsertSchema", async () => {
      patchStub.resolves({ body: { name: "op-name" } });
      pollOperationStub.resolves({ name: "schema" });
      const schemaToUpsert: types.Schema = {
        name: "projects/p/locations/l/services/s/schemas/main",
        datasources: [],
        source: {},
      };
      const schema = await client.upsertSchema(schemaToUpsert);
      expect(schema).to.deep.equal({ name: "schema" });
      expect(patchStub).to.be.calledWith(
        "projects/p/locations/l/services/s/schemas/main",
        schemaToUpsert,
        { queryParams: { allowMissing: "true", validateOnly: "false" } },
      );
    });

    it("deleteSchema", async () => {
      deleteStub.resolves({ body: { name: "op-name" } });
      pollOperationStub.resolves();
      await client.deleteSchema("projects/p/locations/l/services/s");
      expect(deleteStub).to.be.calledWith("projects/p/locations/l/services/s/schemas/main");
    });
  });

  describe("Connector methods", () => {
    it("getConnector", async () => {
      getStub.resolves({ body: { name: "connector" } });
      const connector = await client.getConnector("projects/p/locations/l/services/s/connectors/c");
      expect(connector).to.deep.equal({ name: "connector" });
      expect(getStub).to.be.calledWith("projects/p/locations/l/services/s/connectors/c");
    });

    it("listConnectors", async () => {
      getStub.onFirstCall().resolves({
        body: { connectors: [{ name: "c1" }], nextPageToken: "next" },
      });
      getStub.onSecondCall().resolves({
        body: { connectors: [{ name: "c2" }] },
      });
      const connectors = await client.listConnectors("projects/p/locations/l/services/s");
      expect(connectors).to.deep.equal([{ name: "c1" }, { name: "c2" }]);
    });

    it("upsertConnector", async () => {
      patchStub.resolves({ body: { name: "op-name" } });
      pollOperationStub.resolves({ name: "connector" });
      const connectorToUpsert: types.Connector = {
        name: "projects/p/locations/l/services/s/connectors/c",
        source: {},
      };
      const connector = await client.upsertConnector(connectorToUpsert);
      expect(connector).to.deep.equal({ name: "connector" });
      expect(patchStub).to.be.calledWith(
        "projects/p/locations/l/services/s/connectors/c?allow_missing=true",
        connectorToUpsert,
      );
    });

    it("deleteConnector", async () => {
      deleteStub.resolves({ body: { name: "op-name" } });
      pollOperationStub.resolves();
      await client.deleteConnector("projects/p/locations/l/services/s/connectors/c");
      expect(deleteStub).to.be.calledWith("projects/p/locations/l/services/s/connectors/c");
    });
  });
});
