import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import * as databaseManagement from "../../management/database";
import { mockAuth } from "../helpers";

const PROJECT_ID = "the-best-firebase-project";
const DATABASE_INSTANCE_NAME = "some_instance";
const SOME_DATABASE_INSTANCE: databaseManagement.DatabaseInstance = {
  name: DATABASE_INSTANCE_NAME,
  project: PROJECT_ID,
  databaseUrl: "https://my-db-url.firebaseio.com",
  type: databaseManagement.DatabaseInstanceType.USER_DATABASE,
  state: databaseManagement.DatabaseInstanceState.ACTIVE,
};

describe("Database management", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getInstanceDetails", () => {
    it("should resolve with DatabaseInstance if API call succeeds", async () => {
      const expectedDatabaseInstance = {
        name: DATABASE_INSTANCE_NAME,
        project: PROJECT_ID,
        databaseUrl: "https://my-db-url.firebaseio.com",
        type: "user",
        state: "active",
      };
      apiRequestStub.onFirstCall().resolves({ body: SOME_DATABASE_INSTANCE });
      const resultDatabaseInstance = await databaseManagement.getDatabaseInstanceDetails(
        PROJECT_ID,
        DATABASE_INSTANCE_NAME
      );
      expect(resultDatabaseInstance).to.deep.equal(expectedDatabaseInstance);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/-/instances/${DATABASE_INSTANCE_NAME}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });

    it("should reject if API call fails", async () => {
      const badInstanceName = "non-existent-instance";
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await databaseManagement.getDatabaseInstanceDetails(PROJECT_ID, badInstanceName);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to get instance details for instance: ${badInstanceName}. See firebase-debug.log for more details.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/-/instances/${badInstanceName}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });
  });

  describe("createInstance", () => {
    it("should resolve with new DatabaseInstance if API call succeeds", async () => {
      const expectedDatabaseInstance = {
        name: DATABASE_INSTANCE_NAME,
        project: PROJECT_ID,
        databaseUrl: "https://my-db-url.firebaseio.com",
        type: "user",
        state: "active",
      };
      apiRequestStub.onFirstCall().resolves({ body: SOME_DATABASE_INSTANCE });
      const resultDatabaseInstance = await databaseManagement.createInstance(
        PROJECT_ID,
        DATABASE_INSTANCE_NAME,
        databaseManagement.DatabaseLocation.ASIA_SOUTHEAST
      );
      expect(resultDatabaseInstance).to.deep.equal(expectedDatabaseInstance);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${databaseManagement.DatabaseLocation.ASIA_SOUTHEAST}/instances?databaseId=${DATABASE_INSTANCE_NAME}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });

    it("should reject if API call fails", async () => {
      const badInstanceName = "non-existent-instance";
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await databaseManagement.createInstance(
          PROJECT_ID,
          badInstanceName,
          databaseManagement.DatabaseLocation.US_CENTRAL
        );
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to create instance: ${badInstanceName}. See firebase-debug.log for more details.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${databaseManagement.DatabaseLocation.US_CENTRAL}/instances?databaseId=${badInstanceName}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });
  });
});
