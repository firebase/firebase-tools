import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";

import { mockAuth } from "../helpers";
import {
  DatabaseLocation,
  DatabaseInstance,
  DatabaseInstanceType,
  DatabaseInstanceState,
  getDatabaseInstanceDetails,
  createInstance,
} from "../../management/database";

const PROJECT_ID = "the-best-firebase-project";
const DATABASE_INSTANCE_NAME = "some_instance";
DatabaseLocation.US_CENTRAL1;
const SOME_DATABASE_INSTANCE: DatabaseInstance = {
  name: DATABASE_INSTANCE_NAME,
  location: DatabaseLocation.US_CENTRAL1,
  project: PROJECT_ID,
  databaseUrl: "https://my-db-url.firebaseio.com",
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

const SOME_DATABASE_INSTANCE_ASIA_SOUTHEAST: DatabaseInstance = {
  name: DATABASE_INSTANCE_NAME,
  location: DatabaseLocation.ASIA_SOUTHEAST1,
  project: PROJECT_ID,
  databaseUrl: "https://my-db-url.firebaseio.com",
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

const INSTANCE_RESPONSE_US_CENTRAL1 = {
  name: `projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances/${DATABASE_INSTANCE_NAME}`,
  project: PROJECT_ID,
  databaseUrl: "https://my-db-url.firebaseio.com",
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

const INSTANCE_RESPONSE_ASIA_SOUTHEAST1 = {
  name: `projects/${PROJECT_ID}/locations/${DatabaseLocation.ASIA_SOUTHEAST1}/instances/${DATABASE_INSTANCE_NAME}`,
  project: PROJECT_ID,
  databaseUrl: "https://my-db-url.firebaseio.com",
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

describe.only("Database management", () => {
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
      const expectedDatabaseInstance = SOME_DATABASE_INSTANCE;
      apiRequestStub.onFirstCall().resolves({ body: INSTANCE_RESPONSE_US_CENTRAL1 });

      const resultDatabaseInstance = await getDatabaseInstanceDetails(
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
        await getDatabaseInstanceDetails(PROJECT_ID, badInstanceName);
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
      const expectedDatabaseInstance = SOME_DATABASE_INSTANCE_ASIA_SOUTHEAST;
      apiRequestStub.onFirstCall().resolves({ body: INSTANCE_RESPONSE_ASIA_SOUTHEAST1 });
      const resultDatabaseInstance = await createInstance(
        PROJECT_ID,
        DATABASE_INSTANCE_NAME,
        DatabaseLocation.ASIA_SOUTHEAST1
      );
      expect(resultDatabaseInstance).to.deep.equal(expectedDatabaseInstance);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.ASIA_SOUTHEAST1}/instances?databaseId=${DATABASE_INSTANCE_NAME}`,
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
        await createInstance(PROJECT_ID, badInstanceName, DatabaseLocation.US_CENTRAL1);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to create instance: ${badInstanceName}. See firebase-debug.log for more details.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances?databaseId=${badInstanceName}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });
  });
});
