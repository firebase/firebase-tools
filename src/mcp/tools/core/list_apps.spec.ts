import { expect } from "chai";
import * as sinon from "sinon";
import { list_apps } from "./list_apps";
import * as apps from "../../../management/apps";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";

describe("list_apps tool", () => {
  const projectId = "test-project";
  const name = "test-app";
  const appList = [{ appId: "app1", platform: "WEB", projectId, name }];

  let listFirebaseAppsStub: sinon.SinonStub;

  beforeEach(() => {
    listFirebaseAppsStub = sinon.stub(apps, "listFirebaseApps");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should list all apps when no platform is specified", async () => {
    listFirebaseAppsStub.resolves(appList);

    const result = await list_apps.fn({}, { projectId } as ServerToolContext);

    expect(listFirebaseAppsStub).to.be.calledWith(projectId, "ANY");
    expect(result).to.deep.equal(toContent(appList));
  });

  it("should list apps for a specific platform", async () => {
    listFirebaseAppsStub.resolves(appList);

    const result = await list_apps.fn({ platform: "web" }, { projectId } as ServerToolContext);

    expect(listFirebaseAppsStub).to.be.calledWith(projectId, "WEB");
    expect(result).to.deep.equal(toContent(appList));
  });

  it("should handle the 'all' platform option", async () => {
    listFirebaseAppsStub.resolves(appList);

    await list_apps.fn({ platform: "all" }, { projectId } as ServerToolContext);

    expect(listFirebaseAppsStub).to.be.calledWith(projectId, "ANY");
  });

  it("should throw a descriptive error on failure", async () => {
    const originalError = new Error("API call failed");
    listFirebaseAppsStub.rejects(originalError);

    await expect(list_apps.fn({}, { projectId } as ServerToolContext)).to.be.rejectedWith(
      `Failed to list Firebase apps${originalError.message}`,
    );
  });
});
