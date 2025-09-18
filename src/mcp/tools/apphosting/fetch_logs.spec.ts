import { expect } from "chai";
import * as sinon from "sinon";
import { fetch_logs } from "./fetch_logs";
import * as apphosting from "../../../gcp/apphosting";
import * as run from "../../../gcp/run";
import * as cloudlogging from "../../../gcp/cloudlogging";
import { FirebaseError } from "../../../error";
import { toContent } from "../../util";

describe("fetch_logs tool", () => {
  const projectId = "test-project";
  const location = "us-central1";
  const backendId = "test-backend";

  let getBackendStub: sinon.SinonStub;
  let getTrafficStub: sinon.SinonStub;
  let listBuildsStub: sinon.SinonStub;
  let fetchServiceLogsStub: sinon.SinonStub;
  let listEntriesStub: sinon.SinonStub;

  beforeEach(() => {
    getBackendStub = sinon.stub(apphosting, "getBackend");
    getTrafficStub = sinon.stub(apphosting, "getTraffic");
    listBuildsStub = sinon.stub(apphosting, "listBuilds");
    fetchServiceLogsStub = sinon.stub(run, "fetchServiceLogs");
    listEntriesStub = sinon.stub(cloudlogging, "listEntries");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return message if backendId is not specified", async () => {
    const result = await fetch_logs.fn({}, { projectId } as any);
    expect(result).to.deep.equal(toContent("backendId must be specified."));
  });

  context("when buildLogs is false", () => {
    it("should fetch service logs successfully", async () => {
      const backend = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}`,
        managedResources: [
          {
            runService: {
              service: `projects/${projectId}/locations/${location}/services/service-id`,
            },
          },
        ],
      };
      const traffic = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`,
      };
      const logs = ["log entry 1", "log entry 2"];

      getBackendStub.resolves(backend);
      getTrafficStub.resolves(traffic);
      fetchServiceLogsStub.resolves(logs);

      const result = await fetch_logs.fn({ backendId, location }, { projectId } as any);

      expect(getBackendStub).to.be.calledWith(projectId, location, backendId);
      expect(getTrafficStub).to.be.calledWith(projectId, location, backendId);
      expect(fetchServiceLogsStub).to.be.calledWith(projectId, "service-id");
      expect(result).to.deep.equal(toContent(logs));
    });

    it("should throw FirebaseError if service name cannot be determined", async () => {
      const backend = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}`,
        managedResources: [],
      };
      const traffic = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`,
      };

      getBackendStub.resolves(backend);
      getTrafficStub.resolves(traffic);

      await expect(fetch_logs.fn({ backendId, location }, { projectId } as any)).to.be.rejectedWith(
        FirebaseError,
        "Unable to get service name from managedResources.",
      );
    });
  });

  context("when buildLogs is true", () => {
    const buildLogsUri = `https://console.cloud.google.com/build/region=${location}/12345`;
    const build = { createTime: new Date().toISOString(), buildLogsUri };
    const builds = { builds: [build] };

    it("should fetch build logs successfully", async () => {
      const backend = { name: `projects/${projectId}/locations/${location}/backends/${backendId}` };
      const traffic = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`,
      };
      const logEntries = [{ textPayload: "build log 1" }];

      getBackendStub.resolves(backend);
      getTrafficStub.resolves(traffic);
      listBuildsStub.resolves(builds);
      listEntriesStub.resolves(logEntries);

      const result = await fetch_logs.fn({ buildLogs: true, backendId, location }, {
        projectId,
      } as any);

      expect(listBuildsStub).to.be.calledWith(projectId, location, backendId);
      expect(listEntriesStub).to.be.calledOnce;
      expect(listEntriesStub.args[0][1]).to.include('resource.labels.build_id="12345"');
      expect(result).to.deep.equal(toContent(logEntries));
    });

    it("should return 'No logs found.' if no build logs are available", async () => {
      const backend = { name: `projects/${projectId}/locations/${location}/backends/${backendId}` };
      const traffic = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`,
      };

      getBackendStub.resolves(backend);
      getTrafficStub.resolves(traffic);
      listBuildsStub.resolves(builds);
      listEntriesStub.resolves([]);

      const result = await fetch_logs.fn({ buildLogs: true, backendId, location }, {
        projectId,
      } as any);
      expect(result).to.deep.equal(toContent("No logs found."));
    });

    it("should throw FirebaseError if build ID cannot be determined from buildLogsUri", async () => {
      const buildWithInvalidUri = {
        createTime: new Date().toISOString(),
        buildLogsUri: "invalid-uri",
      };
      const buildsWithInvalidUri = { builds: [buildWithInvalidUri] };
      const backend = { name: `projects/${projectId}/locations/${location}/backends/${backendId}` };
      const traffic = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`,
      };

      getBackendStub.resolves(backend);
      getTrafficStub.resolves(traffic);
      listBuildsStub.resolves(buildsWithInvalidUri);

      await expect(
        fetch_logs.fn({ buildLogs: true, backendId, location }, { projectId } as any),
      ).to.be.rejectedWith(FirebaseError, "Unable to determine the build ID.");
    });
  });
});
