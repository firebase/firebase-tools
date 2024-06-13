import { expect } from "chai";
import { getProjectAdminSdkConfigOrCached } from "./adminSdkConfig";

describe("adminSdkConfig", () => {
  describe("getProjectAdminSdkConfigOrCached", () => {
    it("should return a fake config for a demo project id", async () => {
      const projectId = "demo-project-1234";
      await expect(getProjectAdminSdkConfigOrCached(projectId)).to.eventually.deep.equal({
        projectId: "demo-project-1234",
        databaseURL: "https://demo-project-1234.firebaseio.com",
        storageBucket: "demo-project-1234.appspot.com",
      });
    });
  });
});
