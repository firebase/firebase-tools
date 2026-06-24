import { expect } from "chai";
import * as sinon from "sinon";

import { getDefaultHostingSite, errNoDefaultSite } from "./getDefaultHostingSite";
import * as projectUtils from "./projectUtils";
import * as projects from "./management/projects";
import * as hostingApi from "./hosting/api";
import { SiteType } from "./hosting/api";

const PROJECT_ID = "test-project-id";

describe("getDefaultHostingSite", () => {
  let sandbox: sinon.SinonSandbox;
  let getFirebaseProjectStub: sinon.SinonStub;
  let listSitesStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    getFirebaseProjectStub = sandbox.stub(projects, "getFirebaseProject");
    listSitesStub = sandbox.stub(hostingApi, "listSites");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return the default hosting site from project resources", async () => {
    const defaultSite = "my-default-site";
    getFirebaseProjectStub.resolves({
      resources: { hostingSite: defaultSite },
    });

    const site = await getDefaultHostingSite({ projectId: PROJECT_ID });

    expect(site).to.equal(defaultSite);
    expect(getFirebaseProjectStub).to.have.been.calledWith(PROJECT_ID);
    expect(listSitesStub).to.not.have.been.called;
  });

  it("should return the default hosting site from listSites if not in project resources", async () => {
    const defaultSite = "another-default-site";
    getFirebaseProjectStub.resolves({ resources: {} });
    listSitesStub.resolves([
      { name: `projects/${PROJECT_ID}/sites/other-site`, type: SiteType.USER_SITE },
      { name: `projects/${PROJECT_ID}/sites/${defaultSite}`, type: SiteType.DEFAULT_SITE },
    ]);

    const site = await getDefaultHostingSite({ projectId: PROJECT_ID });

    expect(site).to.equal(defaultSite);
    expect(getFirebaseProjectStub).to.have.been.calledWith(PROJECT_ID);
    expect(listSitesStub).to.have.been.calledWith(PROJECT_ID);
  });

  it("should throw an error if no default site is found", async () => {
    getFirebaseProjectStub.resolves({ resources: {} });
    listSitesStub.resolves([
      { name: `projects/${PROJECT_ID}/sites/other-site`, type: SiteType.USER_SITE },
    ]);

    await expect(getDefaultHostingSite({ projectId: PROJECT_ID })).to.be.rejectedWith(
      errNoDefaultSite,
    );

    expect(getFirebaseProjectStub).to.have.been.calledWith(PROJECT_ID);
    expect(listSitesStub).to.have.been.calledWith(PROJECT_ID);
  });

  it("should throw an error if listSites returns no sites", async () => {
    getFirebaseProjectStub.resolves({ resources: {} });
    listSitesStub.resolves([]);

    await expect(getDefaultHostingSite({ projectId: PROJECT_ID })).to.be.rejectedWith(
      errNoDefaultSite,
    );
  });
});
