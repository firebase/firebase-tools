import { expect } from "chai";
import * as sinon from "sinon";
import * as apphosting from "../../gcp/apphosting";

describe("apphosting", () => {
  describe("getNextBuildId", () => {
    let listRollouts: sinon.SinonStub;

    beforeEach(() => {
      listRollouts = sinon.stub(apphosting, "listRollouts");
    });

    afterEach(() => {
      listRollouts.restore();
    });

    function idPrefix(date: Date): string {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCDay()).padStart(2, "0");
      const day = String(date.getUTCDay()).padStart(2, "0");
      return `build-${year}-${month}-${day}`;
    }

    it("Should handle explicit counters", async () => {
      const id = await apphosting.getNextRolloutId("unused", "unused", "unused", 1);
      expect(id).matches(new RegExp(`^${idPrefix(new Date())}-1$`));
      expect(listRollouts).to.not.have.been.called;
    });

    it("Should handle missing regions", async () => {
      listRollouts.returns({
        rollouts: [],
        unreachable: ["us-central1"],
      });

      await expect(
        apphosting.getNextRolloutId("project", "us-central1", "backend"),
      ).to.be.rejectedWith(/unreachable .*us-central1/);
      expect(listRollouts).to.have.been.calledWith("project", "us-central1", "backend");
    });

    it("Should handle the first build of a day", async () => {
      listRollouts.returns({
        rollouts: [],
        unreachable: [],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).equals(`${idPrefix(new Date())}-1`);
      expect(listRollouts).to.have.been.calledWith("project", "location", "backend");
    });

    it("Should increment from the correct date", async () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      listRollouts.returns({
        rollouts: [
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(yesterday)}-5`,
          },
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(today)}-1`,
          },
        ],
        unreachable: [],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).to.equal(`${idPrefix(today)}-2`);
    });

    it("Should handle the first build of the day", async () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      listRollouts.returns({
        rollouts: [
          {
            name: `projects/project/locations/location/backends/backend/rollouts/${idPrefix(yesterday)}-5`,
          },
        ],
        unreachable: [],
      });

      const id = await apphosting.getNextRolloutId("project", "location", "backend");
      expect(id).to.equal(`${idPrefix(today)}-1`);
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
        queryParams: { nextPageToken: "2" },
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
        queryParams: { nextPageToken: "2" },
      });
    });
  });
});
