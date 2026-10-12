import { expect } from "chai";
import {
  parseServiceName,
  parseConnectorName,
  parseCloudSQLInstanceName,
  isGraphqlName,
} from "./names";

describe("dataconnect/names", () => {
  describe("parseServiceName", () => {
    it("should parse valid service name", () => {
      const name = "projects/my-project/locations/us-central1/services/my-service";
      const res = parseServiceName(name);
      expect(res.projectId).to.equal("my-project");
      expect(res.location).to.equal("us-central1");
      expect(res.serviceId).to.equal("my-service");
      expect(res.toString()).to.equal(name);
    });

    it("should throw on invalid service name", () => {
      expect(() => parseServiceName("invalid-name")).to.throw(/not a valid service name/);
    });
  });

  describe("parseConnectorName", () => {
    it("should parse valid connector name", () => {
      const name =
        "projects/my-project/locations/us-central1/services/my-service/connectors/my-connector";
      const res = parseConnectorName(name);
      expect(res.projectId).to.equal("my-project");
      expect(res.location).to.equal("us-central1");
      expect(res.serviceId).to.equal("my-service");
      expect(res.connectorId).to.equal("my-connector");
      expect(res.toString()).to.equal(name);
    });

    it("should throw on invalid connector name", () => {
      expect(() => parseConnectorName("projects/my-project/services/only")).to.throw(
        /not a valid connector name/,
      );
    });
  });

  describe("parseCloudSQLInstanceName", () => {
    it("should parse valid CloudSQL instance name", () => {
      const name = "projects/my-project/locations/us-central1/instances/my-instance";
      const res = parseCloudSQLInstanceName(name);
      expect(res.projectId).to.equal("my-project");
      expect(res.location).to.equal("us-central1");
      expect(res.instanceId).to.equal("my-instance");
      expect(res.toString()).to.equal(
        "projects/my-project/locations/us-central1/instances/my-instance",
      );
    });

    it("should throw on invalid CloudSQL instance name", () => {
      expect(() => parseCloudSQLInstanceName("invalid")).to.throw(
        /not a valid cloudSQL instance name/,
      );
    });
  });

  describe("isGraphqlName", () => {
    it("should validate correct names", () => {
      expect(isGraphqlName("User")).to.be.true;
      expect(isGraphqlName("_test")).to.be.true;
      expect(isGraphqlName("Test123")).to.be.true;
    });

    it("should invalidate wrong names", () => {
      expect(isGraphqlName("1User")).to.be.false;
      expect(isGraphqlName("user-name")).to.be.false;
      expect(isGraphqlName("")).to.be.false;
    });
  });
});
