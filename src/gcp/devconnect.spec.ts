import { expect } from "chai";
import * as sinon from "sinon";
import * as devconnect from "./devConnect";

describe("developer connect", () => {
  let post: sinon.SinonStub;
  let get: sinon.SinonStub;

  const projectId = "project";
  const location = "us-central1";
  const connectionId = "apphosting-connection";
  const gitRepoLinkId = "git-repo-link";
  const connectionsRequestPath = `projects/${projectId}/locations/${location}/connections`;
  const gitRepoLinkPath = `projects/${projectId}/locations/${location}/connections/${connectionId}/gitRepositoryLinks/${gitRepoLinkId}`;

  function mockConnection(id: string, createTime: string): devconnect.Connection {
    return {
      name: `projects/${projectId}/locations/${location}/connections/${id}`,
      disabled: false,
      createTime: createTime,
      updateTime: "1",
      installationState: {
        stage: "COMPLETE",
        message: "complete",
        actionUri: "https://google.com",
      },
      reconciling: false,
    };
  }

  beforeEach(() => {
    post = sinon.stub(devconnect.client, "post");
    get = sinon.stub(devconnect.client, "get");
  });

  afterEach(() => {
    post.restore();
    get.restore();
  });

  describe("createConnection", () => {
    it("ensures githubConfig is FIREBASE", async () => {
      post.returns({ body: {} });
      await devconnect.createConnection(projectId, location, connectionId, {});

      expect(post).to.be.calledWith(
        connectionsRequestPath,
        { githubConfig: { githubApp: "FIREBASE" } },
        { queryParams: { connectionId } },
      );
    });
  });

  describe("listConnections", () => {
    it("interates through all pages and returns a single list", async () => {
      const firstConnection = { name: "conn1", installationState: { stage: "COMPLETE" } };
      const secondConnection = { name: "conn2", installationState: { stage: "COMPLETE" } };
      const thirdConnection = { name: "conn3", installationState: { stage: "COMPLETE" } };

      get
        .onFirstCall()
        .returns({
          body: {
            connections: [firstConnection],
            nextPageToken: "someToken",
          },
        })
        .onSecondCall()
        .returns({
          body: {
            connections: [secondConnection],
            nextPageToken: "someToken2",
          },
        })
        .onThirdCall()
        .returns({
          body: {
            connections: [thirdConnection],
          },
        });

      const conns = await devconnect.listAllConnections(projectId, location);
      expect(get).callCount(3);
      expect(conns).to.deep.equal([firstConnection, secondConnection, thirdConnection]);
    });
  });
  describe("listAllLinkableGitRepositories", () => {
    it("interates through all pages and returns a single list", async () => {
      const firstRepo = { cloneUri: "repo1" };
      const secondRepo = { cloneUri: "repo2" };
      const thirdRepo = { cloneUri: "repo3" };

      get
        .onFirstCall()
        .returns({
          body: {
            linkableGitRepositories: [firstRepo],
            nextPageToken: "someToken",
          },
        })
        .onSecondCall()
        .returns({
          body: {
            linkableGitRepositories: [secondRepo],
            nextPageToken: "someToken2",
          },
        })
        .onThirdCall()
        .returns({
          body: {
            linkableGitRepositories: [thirdRepo],
          },
        });

      const conns = await devconnect.listAllLinkableGitRepositories(
        projectId,
        location,
        connectionId,
      );
      expect(get).callCount(3);
      expect(conns).to.deep.equal([firstRepo, secondRepo, thirdRepo]);
    });
  });

  describe("listAllBranches", () => {
    it("interates through all pages and returns a single list and map", async () => {
      const firstBranch = "test";
      const secondBranch = "test2";
      const thirdBranch = "test3";

      get
        .onFirstCall()
        .returns({
          body: {
            refNames: [firstBranch],
            nextPageToken: "someToken",
          },
        })
        .onSecondCall()
        .returns({
          body: {
            refNames: [secondBranch],
            nextPageToken: "someToken2",
          },
        })
        .onThirdCall()
        .returns({
          body: {
            refNames: [thirdBranch],
          },
        });

      const branches = await devconnect.listAllBranches(
        "/projects/blah/locations/us-central1/connections/blah",
      );
      expect(get).callCount(3);

      expect(branches).to.deep.equal(new Set([firstBranch, secondBranch, thirdBranch]));
    });
    describe("sortConnectionsByCreateTime", () => {
      it("sorts the list of connections from earliest to latest", () => {
        const firstConnection = mockConnection("conn1", "2024-07-03T16:55:35.974826076Z");
        const secondConnection = mockConnection("conn2", "2024-07-02T17:26:16.000154754Z");
        const thirdConnection = mockConnection("conn3", "2024-07-01T21:32:29.992488750Z");
        const fourthConnection = mockConnection("conn4", "2024-07-02T17:41:25.366819004Z");
        const fifthConnection = mockConnection("conn5", "2024-07-02T17:22:07.171899854Z");
        const sixthConnection = mockConnection("conn6", "2024-07-01T21:31:10.148324612Z");

        const connections = [
          firstConnection,
          secondConnection,
          thirdConnection,
          fourthConnection,
          fifthConnection,
          sixthConnection,
        ];

        expect(devconnect.sortConnectionsByCreateTime(connections)).to.deep.equal([
          sixthConnection,
          thirdConnection,
          fifthConnection,
          secondConnection,
          fourthConnection,
          firstConnection,
        ]);
      });
    });
  });

  describe("extractGitRepositoryLinkComponents", () => {
    it("correctly extracts the connection and git repository link ID", () => {
      expect(devconnect.extractGitRepositoryLinkComponents(gitRepoLinkPath)).to.deep.equal({
        connection: "apphosting-connection",
        gitRepoLink: "git-repo-link",
      });
    });
  });
});
