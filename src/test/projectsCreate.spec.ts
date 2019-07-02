import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import {
  addFirebaseToCloudProject,
  createCloudProject,
  ParentResource,
  ParentResourceType,
} from "../projectsCreate";
import * as pollUtils from "../operation-poller";
import { mockAuth } from "./helpers";

const PROJECT_ID = "the-best-firebase-project";
const PROJECT_NUMBER = "1234567890";
const PROJECT_NAME = "The Best Project";
const PARENT_RESOURCE: ParentResource = { id: "1111111111111", type: ParentResourceType.FOLDER };
const OPERATION_RESOURCE_NAME_1 = "operations/cp.11111111111111111";
const OPERATION_RESOURCE_NAME_2 = "operations/cp.22222222222222222";

describe("projectsCreate", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request");
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("createCloudProject", () => {
    it("should resolve with cloud project data if it succeeds", async () => {
      const expectedProjectInfo = {
        projectNumber: PROJECT_NUMBER,
        projectId: PROJECT_ID,
        name: PROJECT_NAME,
      };
      const createCloudProjectStub = createCloudProjectApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves(
        expectedProjectInfo
      );

      expect(
        await createCloudProject(PROJECT_ID, {
          displayName: PROJECT_NAME,
          parentResource: PARENT_RESOURCE,
        })
      ).to.equal(expectedProjectInfo);
      expect(createCloudProjectStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    it("should reject if Cloud project creation fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const createCloudProjectStub = createCloudProjectApiStub().rejects(expectedError);

      let err;
      try {
        await createCloudProject(PROJECT_ID, {
          displayName: PROJECT_NAME,
          parentResource: PARENT_RESOURCE,
        });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(createCloudProjectStub).to.be.calledOnce;
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if Cloud project creation polling throws error", async () => {
      const expectedError = new Error("Entity already exists");
      const createCloudProjectStub = createCloudProjectApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).rejects(
        expectedError
      );

      let err;
      try {
        await createCloudProject(PROJECT_ID, {
          displayName: PROJECT_NAME,
          parentResource: PARENT_RESOURCE,
        });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(createCloudProjectStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    function createCloudProjectApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", "/v1/projects", {
        auth: true,
        origin: api.resourceManagerOrigin,
        timeout: 15000,
        data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
      });
    }

    function pollCreateCloudProjectOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Project Creation Poller",
        apiOrigin: api.resourceManagerOrigin,
        apiVersion: "v1",
        operationResourceName,
      });
    }
  });

  describe("addFirebaseToCloudProject", () => {
    it("should resolve with Firebase project data if it succeeds", async () => {
      const expectFirebaseProjectInfo = {
        projectId: PROJECT_ID,
        displayName: PROJECT_NAME,
      };
      const addFirebaseStub = addFirebaseApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_2 },
      });
      const pollStub = pollAddFirebaseOperationStub(OPERATION_RESOURCE_NAME_2).resolves({
        projectId: PROJECT_ID,
        displayName: PROJECT_NAME,
      });

      expect(await addFirebaseToCloudProject(PROJECT_ID)).to.deep.equal(expectFirebaseProjectInfo);
      expect(addFirebaseStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    it("should reject if add Firebase api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const addFirebaseFailedStub = addFirebaseApiStub().rejects(expectedError);

      let err;
      try {
        await addFirebaseToCloudProject(PROJECT_ID);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(addFirebaseFailedStub).to.be.calledOnce;
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if polling add Firebase operation throws error", async () => {
      const expectedError = new Error("Permission denied");
      const addFirebaseStub = addFirebaseApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_2 },
      });
      const pollStub = pollAddFirebaseOperationStub(OPERATION_RESOURCE_NAME_2).rejects(
        expectedError
      );

      let err;
      try {
        await addFirebaseToCloudProject(PROJECT_ID);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(addFirebaseStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    function addFirebaseApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
      });
    }

    function pollAddFirebaseOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Add Firebase Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });
});
