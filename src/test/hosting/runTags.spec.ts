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
    labels: {},
  };
  function version(
    version: string,
    status: hostingNS.VersionStatus,
    ...rewrites: hostingNS.RunRewrite[]
  ): hostingNS.Version {
    return {
      name: `projects/project/sites/site/versions/${version}`,
      status: status,
      config: {
        rewrites: rewrites.map((r) => {
          return { regex: ".*", run: r };
        }),
      },
      createTime: "now",
      createUser: {
        email: "inlined@gmail.com",
      },
      fileCount: 0,
      versionBytes: 0,
    };
  }

  function service(id: string, ...tags: string[]): runNS.Service {
    return {
      apiVersion: "serving.knative.dev/v1",
      kind: "Service",
      metadata: {
        name: id,
        namespace: "project",
        labels: {
          "cloud.googleapis.com/location": "r",
        },
      },
      spec: {
        template: {
          metadata: {
            name: "revision",
            namespace: "project",
          },
          spec: {
            containers: [],
          },
        },
        traffic: [
          {
            latestRevision: true,
            percent: 100,
          },
          ...tags.map((tag) => {
            return {
              revisionName: `revision-${tag}`,
              tag: tag,
              percent: 0,
            };
          }),
        ],
      },
      status: {
        observedGeneration: 50,
        latestCreatedRevisionName: "latest",
        latestRevisionName: "latest",
        traffic: [
          {
            revisionName: "latest",
            latestRevision: true,
            percent: 100,
          },
          ...tags.map((tag) => {
            return {
              revisionName: `revision-${tag}`,
              tag: tag,
              percent: 0,
            };
          }),
        ],
        conditions: [],
        url: "https://google.com",
        address: {
          url: "https://google.com",
        },
      },
    };
  }

  beforeEach(() => {
    // We need the library to attempt to do something for us to observe side effects.
    run = sinon.stub(runNS);
    hosting = sinon.stub(hostingNS);

    hosting.listSites.withArgs("project").resolves([site]);
    hosting.listVersions.rejects(new Error("Unexpected hosting.listSites"));

    run.getService.rejects(new Error("Unexpected run.getService"));
    run.updateService.rejects(new Error("Unexpected run.updateService"));
  });

  function tagsIn(service: runNS.Service): string[] {
    return service.spec.traffic.map((t) => t.tag).filter((t) => !!t) as string[];
  }

  describe("gcTagsForServices", () => {
    it("leaves only active revisions", async () => {
      hosting.listVersions.resolves([
        version("v1", "FINALIZED", { serviceId: "s1", region: "r", tag: "fh-t1" }),
        version("v2", "CREATED", { serviceId: "s1", region: "r", tag: "fh-t2" }),
        version("v3", "DELETED", { serviceId: "s1", region: "r", tag: "fh-t3" }),
      ]);

      const s1 = service("s1", "fh-t1", "fh-t2", "fh-t3", "fh-no-longer-referenced", "not-by-us");
      const s2 = service("s2", "fh-no-reference");
      s2.spec.traffic.push({
        revisionName: "manual-split",
        tag: "fh-manual-split",
        percent: 1,
      });
      await runTags.gcTagsForServices("project", [s1, s2]);

      expect(tagsIn(s1)).to.deep.equal(["fh-t1", "fh-t2", "not-by-us"]);
      expect(tagsIn(s2)).to.deep.equal(["fh-manual-split"]);
    });
  });
});
