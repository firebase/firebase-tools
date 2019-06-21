import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import {
  createFirebaseProject,
  ParentResource,
  ParentResourceType,
} from "../firebase-resource-manager";
import * as pollUtils from "../operation-poller";
import { mockAuth } from "./helpers";
import { OraWrapper } from "../oraWrapper";

const PROJECT_ID = "the-best-firebase-project";
const PROJECT_NUMBER = "1234567890";
const PROJECT_NAME = "The Best Project";
const PARENT_RESOURCE: ParentResource = { id: "1111111111111", type: ParentResourceType.FOLDER };
const OPERATION_RESOURCE_NAME_1 = "operations/cp.11111111111111111";
const OPERATION_RESOURCE_NAME_2 = "operations/cp.22222222222222222";

// TODO(caot): Removed when "Deferred Analytics" and "Deferred Location" are launched
const TIME_ZONE = "America/Los_Angeles";
const REGION_CODE = "US";
const LOCATION_ID = "us-central";

describe("FirebaseResourceManager", () => {
  describe("createFirebaseProject", () => {
    let sandbox: sinon.SinonSandbox;
    let mockOraWrapper: sinon.SinonMock;
    let apiRequestStub: sinon.SinonStub;
    let pollOperationStub: sinon.SinonStub;
    let calledStubs: sinon.SinonStub[];

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      mockAuth(sandbox);
      mockOraWrapper = sandbox.mock(OraWrapper.prototype);
      apiRequestStub = sandbox.stub(api, "request");
      pollOperationStub = sandbox.stub(pollUtils, "pollOperation");
      calledStubs = [];
    });

    afterEach(() => {
      calledStubs.forEach((stub) => expect(stub.calledOnce).to.be.true);
      mockOraWrapper.verify();
      sandbox.restore();
    });

    it("should resolve with project data if it succeeds", async () => {
      calledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          response: { projectNumber: PROJECT_NUMBER },
        }),
        _addFirebaseApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_2 } }),
        _pollAddFirebaseOperationStub(OPERATION_RESOURCE_NAME_2).resolves({
          response: { projectId: PROJECT_ID, displayName: PROJECT_NAME },
        })
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(2);
      mockOraWrapper.expects("fail").never();

      expect(await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE)).to.deep.equal({
        projectId: PROJECT_ID,
      });
    });

    it("should reject if Cloud project creation fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      calledStubs.push(_createCloudProjectApiStub().rejects(expectedError));
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(0);
    });

    it("should reject if Cloud project creation polling throws error", async () => {
      const expectedError = new Error("Entity already exists");
      calledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    it("should reject if add Firebase api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      calledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          response: { projectNumber: PROJECT_NUMBER },
        }),
        _addFirebaseApiStub().rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(2);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    it("should reject if polling add Firebase operation returns error response", async () => {
      const expectedError = new Error("Permission denied");
      calledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          response: { projectNumber: PROJECT_NUMBER },
        }),
        _addFirebaseApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_2 } }),
        _pollAddFirebaseOperationStub(OPERATION_RESOURCE_NAME_2).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(2);
      expect(pollOperationStub.callCount).to.equal(2);
    });

    function _createCloudProjectApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", "/v1/projects", {
        auth: true,
        origin: api.resourceManagerOrigin,
        timeout: 15000,
        data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
      });
    }

    function _addFirebaseApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { timeZone: TIME_ZONE, regionCode: REGION_CODE, locationId: LOCATION_ID },
      });
    }

    function _pollCreateCloudProjectOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Project Creation Poller",
        apiOrigin: api.resourceManagerOrigin,
        apiVersion: "v1",
        operationResourceName,
      });
    }

    function _pollAddFirebaseOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Add Firebase Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });
});
