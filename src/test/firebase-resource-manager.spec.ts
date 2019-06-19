import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import {
  FirebaseResourceManager,
  ParentResource,
  ParentResourceType,
} from "../firebase-resource-manager";
import { mockAuth } from "./helpers";
import { OraWrapper } from "../oraWrapper";

const PROJECT_ID = "the-best-firebase-project";
const PROJECT_NUMBER = "1234567890";
const PROJECT_NAME = "The Best Project";
const PARENT_RESOURCE: ParentResource = { id: "1111111111111", type: ParentResourceType.FOLDER };

// TODO(caot): Removed when "Deferred Analytics" and "Deferred Location" are launched
const TIME_ZONE = "America/Los_Angeles";
const REGION_CODE = "US";
const LOCATION_ID = "us-central";

describe("FirebaseResourceManager", () => {
  describe("createFirebaseProject", () => {
    let sandbox: sinon.SinonSandbox;
    let mockApi: sinon.SinonMock;
    let mockPoller: sinon.SinonMock;
    let mockOraWrapper: sinon.SinonMock;
    let expectedResolvedValues = [];
    const firebaseResourceManager = new FirebaseResourceManager();

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      mockAuth(sandbox);
      mockApi = sandbox.mock(api);
      mockOraWrapper = sandbox.mock(OraWrapper.prototype);
      mockPoller = sandbox.mock((firebaseResourceManager as any).poller);
    });

    afterEach(() => {
      mockApi.verify();
      mockPoller.verify();
      mockOraWrapper.verify();
      sandbox.restore();
      expectedResolvedValues = [];
    });

    it("should resolve with project data if it succeeds", async () => {
      expectedResolvedValues = [
        { body: { name: "operations/cp.111111111111111" } },
        { response: { projectNumber: PROJECT_NUMBER } },
        { body: { name: "operations/cp.222222222222222" } },
        { response: { projectId: PROJECT_ID, displayName: PROJECT_NAME } },
      ];
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .resolves(expectedResolvedValues[0]);
      mockApi
        .expects("request")
        .withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: { timeZone: TIME_ZONE, regionCode: REGION_CODE, locationId: LOCATION_ID },
        })
        .once()
        .resolves(expectedResolvedValues[2]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: expectedResolvedValues[0].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[1]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Add Firebase Poller",
          apiOrigin: api.firebaseApiOrigin,
          apiVersion: "v1beta1",
          operationResourceName: expectedResolvedValues[2].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[3]);
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(2);
      mockOraWrapper.expects("fail").never();

      expect(
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        )
      ).to.deep.equal({ projectId: PROJECT_ID });
    });

    it("should reject if Cloud project creation fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .rejects(expectedError);
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
    });

    it("should reject if Cloud project creation polling returns response with error", async () => {
      const expectedError = new Error("Entity already exists");
      expectedResolvedValues = [
        { body: { name: "operations/cp.111111111111111" } },
        { error: expectedError },
      ];
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .resolves(expectedResolvedValues[0]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: expectedResolvedValues[0].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[1]);
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
    });

    it("should reject if Cloud project creation polling throws error", async () => {
      const expectedError = new Error("Timed out");
      const expectedResolvedValue = { body: { name: "operations/cp.111111111111111" } };
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .resolves(expectedResolvedValue);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: expectedResolvedValue.body!.name,
        })
        .once()
        .rejects(expectedError);
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
    });

    it("should reject if add Firebase api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      expectedResolvedValues = [
        { body: { name: "operations/cp.111111111111111" } },
        { response: { projectNumber: PROJECT_NUMBER } },
      ];
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .resolves(expectedResolvedValues[0]);
      mockApi
        .expects("request")
        .withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: { timeZone: TIME_ZONE, regionCode: REGION_CODE, locationId: LOCATION_ID },
        })
        .once()
        .rejects(expectedError);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: expectedResolvedValues[0].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[1]);
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
    });

    it("should reject if polling add Firebase operation returns error response", async () => {
      const expectedError = new Error("Permission denied");
      expectedResolvedValues = [
        { body: { name: "operations/cp.111111111111111" } },
        { response: { projectNumber: PROJECT_NUMBER } },
        { body: { name: "operations/cp.222222222222222" } },
        { error: expectedError },
      ];
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .resolves(expectedResolvedValues[0]);
      mockApi
        .expects("request")
        .withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: { timeZone: TIME_ZONE, regionCode: REGION_CODE, locationId: LOCATION_ID },
        })
        .once()
        .resolves(expectedResolvedValues[2]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: expectedResolvedValues[0].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[1]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Add Firebase Poller",
          apiOrigin: api.firebaseApiOrigin,
          apiVersion: "v1beta1",
          operationResourceName: expectedResolvedValues[2].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[3]);
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
    });

    it("should reject if polling add Firebase operation rejects with error", async () => {
      const expectedError = new Error("Timed out");
      expectedResolvedValues = [
        { body: { name: "operations/cp.111111111111111" } },
        { response: { projectNumber: PROJECT_NUMBER } },
        { body: { name: "operations/cp.222222222222222" } },
      ];
      mockApi
        .expects("request")
        .withArgs("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        })
        .once()
        .resolves(expectedResolvedValues[0]);
      mockApi
        .expects("request")
        .withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: { timeZone: TIME_ZONE, regionCode: REGION_CODE, locationId: LOCATION_ID },
        })
        .once()
        .resolves(expectedResolvedValues[2]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: expectedResolvedValues[0].body!.name,
        })
        .once()
        .resolves(expectedResolvedValues[1]);
      mockPoller
        .expects("poll")
        .withArgs({
          pollerName: "Add Firebase Poller",
          apiOrigin: api.firebaseApiOrigin,
          apiVersion: "v1beta1",
          operationResourceName: expectedResolvedValues[2].body!.name,
        })
        .once()
        .rejects(expectedError);
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await firebaseResourceManager.createFirebaseProject(
          PROJECT_ID,
          PROJECT_NAME,
          PARENT_RESOURCE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equals(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
    });
  });
});
