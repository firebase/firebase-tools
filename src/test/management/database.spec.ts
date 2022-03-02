import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";

import {
  DatabaseLocation,
  DatabaseInstance,
  DatabaseInstanceType,
  DatabaseInstanceState,
  getDatabaseInstanceDetails,
  createInstance,
  listDatabaseInstances,
  checkInstanceNameAvailable,
} from "../../management/database";

const PROJECT_ID = "the-best-firebase-project";
const DATABASE_INSTANCE_NAME = "some_instance";
const SOME_DATABASE_INSTANCE: DatabaseInstance = {
  name: DATABASE_INSTANCE_NAME,
  location: DatabaseLocation.US_CENTRAL1,
  project: PROJECT_ID,
  databaseUrl: generateDatabaseUrl(DATABASE_INSTANCE_NAME, DatabaseLocation.US_CENTRAL1),
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

const SOME_DATABASE_INSTANCE_EUROPE_WEST1: DatabaseInstance = {
  name: DATABASE_INSTANCE_NAME,
  location: DatabaseLocation.EUROPE_WEST1,
  project: PROJECT_ID,
  databaseUrl: generateDatabaseUrl(DATABASE_INSTANCE_NAME, DatabaseLocation.EUROPE_WEST1),
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

const INSTANCE_RESPONSE_US_CENTRAL1 = {
  name: `projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances/${DATABASE_INSTANCE_NAME}`,
  project: PROJECT_ID,
  databaseUrl: generateDatabaseUrl(DATABASE_INSTANCE_NAME, DatabaseLocation.US_CENTRAL1),
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

const INSTANCE_RESPONSE_EUROPE_WEST1 = {
  name: `projects/${PROJECT_ID}/locations/${DatabaseLocation.EUROPE_WEST1}/instances/${DATABASE_INSTANCE_NAME}`,
  project: PROJECT_ID,
  databaseUrl: generateDatabaseUrl(DATABASE_INSTANCE_NAME, DatabaseLocation.EUROPE_WEST1),
  type: DatabaseInstanceType.USER_DATABASE,
  state: DatabaseInstanceState.ACTIVE,
};

function generateDatabaseUrl(instanceName: string, location: DatabaseLocation): string {
  if (location === DatabaseLocation.ANY) {
    throw new Error("can't generate url for any location");
  }
  if (location === DatabaseLocation.US_CENTRAL1) {
    return `https://${instanceName}.firebaseio.com`;
  }
  return `https://${instanceName}.${location}.firebasedatabase.app`;
}

function generateInstanceList(counts: number, location: DatabaseLocation): DatabaseInstance[] {
  return Array.from(Array(counts), (_, i: number) => {
    const name = `my-db-instance-${i}`;
    return {
      name: name,
      location: location,
      project: PROJECT_ID,
      databaseUrl: generateDatabaseUrl(name, location),
      type: DatabaseInstanceType.USER_DATABASE,
      state: DatabaseInstanceState.ACTIVE,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateInstanceListApiResponse(counts: number, location: DatabaseLocation): any[] {
  return Array.from(Array(counts), (_, i: number) => {
    const name = `my-db-instance-${i}`;
    return {
      name: `projects/${PROJECT_ID}/locations/${location}/instances/${name}`,
      project: PROJECT_ID,
      databaseUrl: generateDatabaseUrl(name, location),
      type: DatabaseInstanceType.USER_DATABASE,
      state: DatabaseInstanceState.ACTIVE,
    };
  });
}
describe("Database management", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
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
      } catch (e: any) {
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
      const expectedDatabaseInstance = SOME_DATABASE_INSTANCE_EUROPE_WEST1;
      apiRequestStub.onFirstCall().resolves({ body: INSTANCE_RESPONSE_EUROPE_WEST1 });
      const resultDatabaseInstance = await createInstance(
        PROJECT_ID,
        DATABASE_INSTANCE_NAME,
        DatabaseLocation.EUROPE_WEST1,
        DatabaseInstanceType.USER_DATABASE
      );
      expect(resultDatabaseInstance).to.deep.equal(expectedDatabaseInstance);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.EUROPE_WEST1}/instances?databaseId=${DATABASE_INSTANCE_NAME}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
          data: {
            type: DatabaseInstanceType.USER_DATABASE,
          },
        }
      );
    });

    it("should reject if API call fails", async () => {
      const badInstanceName = "non-existent-instance";
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await createInstance(
          PROJECT_ID,
          badInstanceName,
          DatabaseLocation.US_CENTRAL1,
          DatabaseInstanceType.DEFAULT_DATABASE
        );
      } catch (e: any) {
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
          data: {
            type: DatabaseInstanceType.DEFAULT_DATABASE,
          },
        }
      );
    });
  });

  describe("checkInstanceNameAvailable", () => {
    it("should resolve with new DatabaseInstance if specified instance name is available and API call succeeds", async () => {
      apiRequestStub.onFirstCall().resolves({ body: INSTANCE_RESPONSE_EUROPE_WEST1 });
      const output = await checkInstanceNameAvailable(
        PROJECT_ID,
        DATABASE_INSTANCE_NAME,
        DatabaseInstanceType.USER_DATABASE,
        DatabaseLocation.EUROPE_WEST1
      );
      expect(output).to.deep.equal({
        available: true,
      });
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.EUROPE_WEST1}/instances?databaseId=${DATABASE_INSTANCE_NAME}&validateOnly=true`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
          data: {
            type: DatabaseInstanceType.USER_DATABASE,
          },
        }
      );
    });

    it("should resolve with suggested instance names if the API call fails with suggestions ", async () => {
      const badInstanceName = "invalid:database|name";
      const expectedErrorObj = {
        context: {
          body: {
            error: {
              details: [
                {
                  metadata: {
                    suggested_database_ids: "dbName1,dbName2,dbName3",
                  },
                },
              ],
            },
          },
        },
      };
      apiRequestStub.onFirstCall().rejects(expectedErrorObj);
      const output = await checkInstanceNameAvailable(
        PROJECT_ID,
        badInstanceName,
        DatabaseInstanceType.USER_DATABASE,
        DatabaseLocation.EUROPE_WEST1
      );
      expect(output).to.deep.equal({
        available: false,
        suggestedIds: ["dbName1", "dbName2", "dbName3"],
      });
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.EUROPE_WEST1}/instances?databaseId=${badInstanceName}&validateOnly=true`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
          data: {
            type: DatabaseInstanceType.USER_DATABASE,
          },
        }
      );
    });

    it("should reject if API call fails without suggestions", async () => {
      const badInstanceName = "non-existent-instance";
      const expectedErrorObj = {
        context: {
          body: {
            error: {
              details: [
                {
                  metadata: {},
                },
              ],
            },
          },
        },
      };
      apiRequestStub.onFirstCall().rejects(expectedErrorObj);

      let err;
      try {
        await checkInstanceNameAvailable(
          PROJECT_ID,
          badInstanceName,
          DatabaseInstanceType.DEFAULT_DATABASE,
          DatabaseLocation.US_CENTRAL1
        );
      } catch (e: any) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to validate Realtime Database instance name: ${badInstanceName}.`
      );
      expect(err.original).to.equal(expectedErrorObj);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances?databaseId=${badInstanceName}&validateOnly=true`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
          data: {
            type: DatabaseInstanceType.DEFAULT_DATABASE,
          },
        }
      );
    });
  });

  describe("listDatabaseInstances", () => {
    it("should resolve with instance list if it succeeds with only 1 api call", async () => {
      const instancesPerLocation = 2;
      const expectedInstanceList = [
        ...generateInstanceList(instancesPerLocation, DatabaseLocation.US_CENTRAL1),
        ...generateInstanceList(instancesPerLocation, DatabaseLocation.EUROPE_WEST1),
      ];
      apiRequestStub.onFirstCall().resolves({
        body: {
          instances: [
            ...generateInstanceListApiResponse(instancesPerLocation, DatabaseLocation.US_CENTRAL1),
            ...generateInstanceListApiResponse(instancesPerLocation, DatabaseLocation.EUROPE_WEST1),
          ],
        },
      });

      const instances = await listDatabaseInstances(PROJECT_ID, DatabaseLocation.ANY, 5);

      expect(instances).to.deep.equal(expectedInstanceList);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/-/instances?pageSize=5`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });

    it("should resolve with specific location", async () => {
      const instancesPerLocation = 2;
      const expectedInstancesList = generateInstanceList(
        instancesPerLocation,
        DatabaseLocation.US_CENTRAL1
      );
      apiRequestStub.onFirstCall().resolves({
        body: {
          instances: [
            ...generateInstanceListApiResponse(instancesPerLocation, DatabaseLocation.US_CENTRAL1),
          ],
        },
      });
      const instances = await listDatabaseInstances(PROJECT_ID, DatabaseLocation.US_CENTRAL1);

      expect(instances).to.deep.equal(expectedInstancesList);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances?pageSize=100`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });

    it("should concatenate pages to get instances list if it succeeds", async () => {
      const countPerLocation = 3;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedInstancesList = [
        ...generateInstanceList(countPerLocation, DatabaseLocation.US_CENTRAL1),
        ...generateInstanceList(countPerLocation, DatabaseLocation.EUROPE_WEST1),
        ...generateInstanceList(countPerLocation, DatabaseLocation.EUROPE_WEST1),
      ];

      const expectedResponsesList = [
        ...generateInstanceListApiResponse(countPerLocation, DatabaseLocation.US_CENTRAL1),
        ...generateInstanceListApiResponse(countPerLocation, DatabaseLocation.EUROPE_WEST1),
        ...generateInstanceListApiResponse(countPerLocation, DatabaseLocation.EUROPE_WEST1),
      ];

      apiRequestStub
        .onFirstCall()
        .resolves({
          body: {
            instances: expectedResponsesList.slice(0, pageSize),
            nextPageToken: nextPageToken,
          },
        })
        .onSecondCall()
        .resolves({
          body: {
            instances: expectedResponsesList.slice(pageSize),
          },
        });

      const instances = await listDatabaseInstances(PROJECT_ID, DatabaseLocation.ANY, pageSize);
      expect(instances).to.deep.equal(expectedInstancesList);
      expect(apiRequestStub.firstCall).to.be.calledWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/-/instances?pageSize=${pageSize}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
      expect(apiRequestStub.secondCall).to.be.calledWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/-/instances?pageSize=${pageSize}&pageToken=${nextPageToken}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });

    it("should reject if the first api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await listDatabaseInstances(PROJECT_ID, DatabaseLocation.ANY);
      } catch (e: any) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase Realtime Database instances. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/-/instances?pageSize=100`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });

    it("should reject if error is thrown in subsequent api call", async () => {
      const expectedError = new Error("HTTP Error 400: unexpected error");
      const countPerLocation = 5;
      const pageSize = 5;
      const nextPageToken = "next-page-token";

      apiRequestStub
        .onFirstCall()
        .resolves({
          body: {
            instances: [
              ...generateInstanceListApiResponse(countPerLocation, DatabaseLocation.US_CENTRAL1),
            ].slice(0, pageSize),
            nextPageToken: nextPageToken,
          },
        })
        .onSecondCall()
        .rejects(expectedError);

      let err;
      try {
        await listDatabaseInstances(PROJECT_ID, DatabaseLocation.US_CENTRAL1, pageSize);
      } catch (e: any) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to list Firebase Realtime Database instances for location ${DatabaseLocation.US_CENTRAL1}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.firstCall).to.be.calledWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances?pageSize=${pageSize}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
      expect(apiRequestStub.secondCall).to.be.calledWith(
        "GET",
        `/v1beta/projects/${PROJECT_ID}/locations/${DatabaseLocation.US_CENTRAL1}/instances?pageSize=${pageSize}&pageToken=${nextPageToken}`,
        {
          auth: true,
          origin: api.rtdbManagementOrigin,
          timeout: 10000,
        }
      );
    });
  });
});
