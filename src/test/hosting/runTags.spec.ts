import { expect } from "chai";
import * as sinon from "sinon";
import * as runNS from "../../gcp/run";
import * as hostingNS from "../../hosting/api";
import * as runTags from "../../hosting/runTags";

describe("runTags", () => {
  let run: sinon.SinonStubbedInstance<typeof runNS>;
  let hosting: sinon.SinonStubbedInstance<typeof hostingNS>;
  const site: hostingNS.Site = {
    name: "projects/project/sites/site",
    defaultUrl: "https://google.com",
    appId: "appId",
  };
  const version(version: string, status: hostingNS.VersionStatus, ...rewrites: hostingNS.Rewrite[]): hostingNS.Version {
    return {
      name: `projects/project/sites/site/versions/${version}`,
      status: status,
      config: {
        rewrites: rewrites,
      },
      createTime: "now",
      createUser: {
        email: "inlined@gmail.com",
      },
      fileCount: 0,
      versionBytes: 0,
    }; 
  }
  const service(id: string): runNS.Service {
    return {
      metadata: {
        name: "projects/project/locations/us-central1/services/" + id,
      }
    }

  }

  beforeEach(() => {
    // We need the library to attempt to do something for us to observe side effects.
    runTags.setDryRun(false);
    run = sinon.stub(runNS);
    hosting = sinon.stub(hostingNS);

    hosting.listSites.withArgs("project").resolves([site]);
    hosting.listVersions.rejects(new Error("Unexpected hosting.listSites"));

    run.getService.rejects(new Error("Unexpected run.getService"));
    run.updateService.rejects(new Error("Unexpected run.updateService"));
  });
});
