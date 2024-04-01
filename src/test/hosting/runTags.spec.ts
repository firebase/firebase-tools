import { expect } from "chai";
import * as sinon from "sinon";
import * as runNS from "../../gcp/run";
import * as hostingNS from "../../hosting/api";
import * as runTagsNS from "../../hosting/runTags";
import { cloneDeep } from "../../utils";

const REGION = "REGION";
const SERVICE = "SERVICE";
const PROJECT = "PROJECT";

describe("runTags", () => {
  let run: sinon.SinonStubbedInstance<typeof runNS>;
  let hosting: sinon.SinonStubbedInstance<typeof hostingNS>;
  let runTags: sinon.SinonStubbedInstance<typeof runTagsNS>;
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

  function service(id: string, ...tags: Array<string | runNS.TrafficTarget>): runNS.Service {
    return {
      apiVersion: "serving.knative.dev/v1",
      kind: "Service",
      metadata: {
        name: id,
        namespace: PROJECT,
        labels: {
          [runNS.LOCATION_LABEL]: REGION,
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
            if (typeof tag === "string") {
              return {
                revisionName: `revision-${tag}`,
                tag: tag,
                percent: 0,
              };
            } else {
              return tag;
            }
          }),
        ],
      },
      status: {
        observedGeneration: 50,
        latestCreatedRevisionName: "latest",
        latestReadyRevisionName: "latest",
        traffic: [
          {
            revisionName: "latest",
            latestRevision: true,
            percent: 100,
          },
          ...tags.map((tag) => {
            if (typeof tag === "string") {
              return {
                revisionName: `revision-${tag}`,
                tag: tag,
                percent: 0,
              };
            } else {
              return {
                percent: 0,
                ...tag,
              };
            }
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
    runTags = sinon.stub(runTagsNS);

    hosting.listSites.withArgs(PROJECT).resolves([site]);
    hosting.listVersions.rejects(new Error("Unexpected hosting.listSites"));

    run.getService.rejects(new Error("Unexpected run.getService"));
    run.updateService.rejects(new Error("Unexpected run.updateService"));
    run.gcpIds.restore();

    runTags.ensureLatestRevisionTagged.throws(
      new Error("Unexpected runTags.ensureLatestRevisionTagged"),
    );
    runTags.gcTagsForServices.rejects(new Error("Unepxected runTags.gcTagsForServices"));
    runTags.setRewriteTags.rejects(new Error("Unexpected runTags.setRewriteTags call"));
    runTags.setGarbageCollectionThreshold.restore();
  });

  afterEach(() => {
    sinon.restore();
  });

  function tagsIn(service: runNS.Service): string[] {
    return service.spec.traffic.map((t) => t.tag).filter((t) => !!t) as string[];
  }

  describe("gcTagsForServices", () => {
    beforeEach(() => {
      runTags.gcTagsForServices.restore();
    });

    it("leaves only active revisions", async () => {
      hosting.listVersions.resolves([
        version("v1", "FINALIZED", { serviceId: "s1", region: REGION, tag: "fh-in-use1" }),
        version("v2", "CREATED", { serviceId: "s1", region: REGION, tag: "fh-in-use2" }),
        version("v3", "DELETED", { serviceId: "s1", region: REGION, tag: "fh-deleted-version" }),
      ]);

      const s1 = service(
        "s1",
        "fh-in-use1",
        "fh-in-use2",
        "fh-deleted-version",
        "fh-no-longer-referenced",
        "not-by-us",
      );
      const s2 = service("s2", "fh-no-reference");
      s2.spec.traffic.push({
        revisionName: "manual-split",
        tag: "fh-manual-split",
        percent: 1,
      });
      await runTags.gcTagsForServices(PROJECT, [s1, s2]);

      expect(tagsIn(s1)).to.deep.equal(["fh-in-use1", "fh-in-use2", "not-by-us"]);
      expect(tagsIn(s2)).to.deep.equal(["fh-manual-split"]);
    });
  });

  describe("setRewriteTags", () => {
    const svc = service(SERVICE);
    const svcName = `projects/${PROJECT}/locations/${REGION}/services/${SERVICE}`;
    beforeEach(() => {
      runTags.setRewriteTags.restore();
    });

    it("preserves existing tags and other types of rewrites", async () => {
      const rewrites: hostingNS.Rewrite[] = [
        {
          glob: "**",
          path: "/index.html",
        },
        {
          glob: "/dynamic",
          run: {
            serviceId: "service",
            region: "us-central1",
            tag: "someone-is-using-this-code-in-a-way-i-dont-expect",
          },
        },
        {
          glob: "/callable",
          function: "function",
          functionRegion: "us-central1",
        },
      ];
      const original = cloneDeep(rewrites);
      await runTags.setRewriteTags(rewrites, "project", "version");
      expect(rewrites).to.deep.equal(original);
    });

    it("replaces tags in rewrites with new/verified tags", async () => {
      const rewrites: hostingNS.Rewrite[] = [
        {
          glob: "**",
          run: {
            serviceId: SERVICE,
            region: REGION,
            tag: runTagsNS.TODO_TAG_NAME,
          },
        },
      ];

      run.getService.withArgs(svcName).resolves(svc);
      // Calls fake apparently doesn't trum the default rejects command
      runTags.ensureLatestRevisionTagged.resetBehavior();
      runTags.ensureLatestRevisionTagged.callsFake(
        (svc: runNS.Service[], tag: string): Promise<Record<string, Record<string, string>>> => {
          expect(tag).to.equal("fh-version");
          svc[0].spec.traffic.push({ revisionName: "latest", tag });
          return Promise.resolve({ [REGION]: { [SERVICE]: tag } });
        },
      );

      await runTags.setRewriteTags(rewrites, PROJECT, "version");
      expect(rewrites).to.deep.equal([
        {
          glob: "**",
          run: {
            serviceId: SERVICE,
            region: REGION,
            tag: "fh-version",
          },
        },
      ]);
    });

    it("garbage collects if necessary", async () => {
      runTagsNS.setGarbageCollectionThreshold(2);
      const svc = service(SERVICE, "fh-1", "fh-2");
      const rewrites: hostingNS.Rewrite[] = [
        {
          glob: "**",
          run: {
            serviceId: SERVICE,
            region: REGION,
            tag: runTagsNS.TODO_TAG_NAME,
          },
        },
      ];
      run.getService.withArgs(svcName).resolves(svc);
      runTags.gcTagsForServices.resolves();
      runTags.ensureLatestRevisionTagged.resolves({ [REGION]: { [SERVICE]: "fh-3" } });
      await runTags.setRewriteTags(rewrites, PROJECT, "3");
      expect(runTags.ensureLatestRevisionTagged);
      expect(runTags.gcTagsForServices).to.have.been.called;
    });
  });

  describe("ensureLatestRevisionTagged", () => {
    beforeEach(() => {
      runTags.ensureLatestRevisionTagged.restore();
    });

    it("Reuses existing tag names", async () => {
      const svc = service(SERVICE, { revisionName: "latest", tag: "existing" });
      await runTags.ensureLatestRevisionTagged([svc], "new-tag");
      expect(svc.spec.traffic).to.deep.equal([
        {
          latestRevision: true,
          percent: 100,
        },
        {
          revisionName: "latest",
          tag: "existing",
        },
      ]);
      expect(run.updateService).to.not.have.been.called;
    });

    it("Adds new tags as necessary", async () => {
      const svc = service(SERVICE);
      run.updateService.resolves();
      await runTags.ensureLatestRevisionTagged([svc], "new-tag");
      expect(svc.spec.traffic).to.deep.equal([
        {
          latestRevision: true,
          percent: 100,
        },
        {
          revisionName: "latest",
          tag: "new-tag",
        },
      ]);
    });
  });
});
