import { expect } from "chai";
import * as sinon from "sinon";
import * as apphosting from "./apphosting";

describe("apphosting", () => {
  describe("getNextBuildId", () => {
    let listRollouts: sinon.SinonStub;
    let listBuilds: sinon.SinonStub;

    beforeEach(() => {
      listRollouts = sinon.stub(apphosting, "listRollouts");
      listBuilds = sinon.stub(apphosting, "listBuilds");
    });

    afterEach(() => {
      listRollouts.restore();
      listBuilds.restore();
    });

    function idPrefix(date: Date): string {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `build-${year}-${month}-${day}`;
    }

    it("should handle explicit counters", async () => {
      const id = await apphosting.getNextRolloutId("unused", "unused", "unused", 1);
      expect(id).matches(new RegExp(`^${idPrefix(new Date())}-001$`));
      expect(listRollouts).to.not.have.been.called;
    });

    it("should handle missing regions (rollouts)", async () => {
      listRollouts.resolves({
        rollouts: [],
        unreachable: ["us-central1"],
      });
      listBuilds.resolves({
        builds: [],
        unreachable: [],
      });

      await expect(
        apphosting.getNextRolloutId("project", "us-central1", "backend"),
      ).to.be.rejectedWith(/unreachable .*us-central1/);
      expect(listRollouts).to.have.been.calledWith("project", "us-central1", "backend");
    });

    it("should handle missing regions (builds)", async () => {
      listRollouts.resolves({
        rollouts: [],
        unreachable: [],
      });
      listBuilds.resolves({
        builds: [],
        unreachable: ["us-central1"],
      });

      await expect(
        apphosting.getNextRolloutId("project", "us-central1", "backend"),
      ).to.be.rejectedWith(/unreachable .*us-central1/);
      expect(listRollouts).to.have.been.calledWith("project", "us-central1", "backend");
    });

    it("should handle the first build of a day", async () => {
      listRollouts.resolves({
        rollouts: [],
        unreachable: [],
      });
      listBuilds.resolves({
        builds: [],
        unreachable: [],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).equals(`${idPrefix(new Date())}-001`);
      expect(listRollouts).to.have.been.calledWith("project", "location", "backend");
    });

    it("should increment from the correct date", async () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      listRollouts.resolves({
        rollouts: [
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(yesterday)}-005`,
          },
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(today)}-001`,
          },
        ],
        unreachable: [],
      });
      listBuilds.resolves({
        builds: [
          {
            name: `projects/project/locations/location/backends/backend/builds/${idPrefix(yesterday)}-005`,
          },
          {
            name: `projects/project/locations/location/backends/backend/builds/${idPrefix(today)}-001`,
          },
        ],
        unreachable: [],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).to.equal(`${idPrefix(today)}-002`);
    });

    it("should handle the first build of the day", async () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      listRollouts.resolves({
        rollouts: [
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(yesterday)}-005`,
          },
        ],
        unreachable: [],
      });
      listBuilds.resolves({
        builds: [
          {
            name: `projects/project/locations/location/backends/backend/builds/${idPrefix(yesterday)}-005`,
          },
        ],
        unreachable: [],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).to.equal(`${idPrefix(today)}-001`);
    });

    it("should handle build & rollout names out of sync (build is latest)", async () => {
      const today = new Date();
      listRollouts.resolves({
        rollouts: [
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(today)}-001`,
          },
        ],
      });
      listBuilds.resolves({
        builds: [
          {
            name: `projects/project/locations/location/backends/backend/builds/${idPrefix(today)}-002`,
          },
        ],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).to.equal(`${idPrefix(today)}-003`);
    });

    it("should handle build & rollout names out of sync (rollout is latest)", async () => {
      const today = new Date();
      listRollouts.resolves({
        rollouts: [
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(today)}-002`,
          },
        ],
      });
      listBuilds.resolves({
        builds: [
          {
            name: `projects/project/locations/location/backends/backend/builds/${idPrefix(today)}-001`,
          },
        ],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).to.equal(`${idPrefix(today)}-003`);
    });
  });

  describe("list APIs", () => {
    let get: sinon.SinonStub;

    beforeEach(() => {
      get = sinon.stub(apphosting.client, "get");
    });

    afterEach(() => {
      get.restore();
    });

    it("paginates listBackends", async () => {
      get.onFirstCall().resolves({
        body: {
          backends: [
            {
              name: "abc",
            },
          ],
          nextPageToken: "2",
        },
      });
      get.onSecondCall().resolves({
        body: {
          unreachable: ["us-central1"],
        },
      });
      await expect(apphosting.listBackends("p", "l")).to.eventually.deep.equal({
        backends: [
          {
            name: "abc",
          },
        ],
        unreachable: ["us-central1"],
      });
      expect(get).to.have.been.calledTwice;
      expect(get).to.have.been.calledWithMatch("projects/p/locations/l/backends", {
        queryParams: { pageToken: "2" },
      });
    });

    it("paginates listBuilds", async () => {
      get.onFirstCall().resolves({
        body: {
          builds: [
            {
              name: "abc",
            },
          ],
          nextPageToken: "2",
        },
      });
      get.onSecondCall().resolves({
        body: {
          unreachable: ["us-central1"],
        },
      });
      await expect(apphosting.listBuilds("p", "l", "b")).to.eventually.deep.equal({
        builds: [
          {
            name: "abc",
          },
        ],
        unreachable: ["us-central1"],
      });
      expect(get).to.have.been.calledTwice;
      expect(get).to.have.been.calledWithMatch("projects/p/locations/l/backends/b/builds", {
        queryParams: { pageToken: "2" },
      });
    });

    it("paginates listRollouts", async () => {
      get.onFirstCall().resolves({
        body: {
          rollouts: [
            {
              name: "abc",
            },
          ],
          nextPageToken: "2",
        },
      });
      get.onSecondCall().resolves({
        body: {
          unreachable: ["us-central1"],
        },
      });
      await expect(apphosting.listRollouts("p", "l", "b")).to.eventually.deep.equal({
        rollouts: [
          {
            name: "abc",
          },
        ],
        unreachable: ["us-central1"],
      });
      expect(get).to.have.been.calledTwice;
      expect(get).to.have.been.calledWithMatch("projects/p/locations/l/backends/b/rollouts", {
        queryParams: { pageToken: "2" },
      });
    });
  });
});
