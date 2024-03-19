import { expect } from "chai";
import * as sinon from "sinon";
import * as devconnect from "../../gcp/devConnect";

describe("developer connect", () => {
  let post: sinon.SinonStub;
  let get: sinon.SinonStub;

  const projectId = "project";
  const location = "us-central1";
  const connectionId = "apphosting-connection";
  const connectionsRequestPath = `projects/${projectId}/locations/${location}/connections`;

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

      const conns = await devconnect.listConnections(projectId, location);
      expect(get).callCount(3);
      expect(conns).to.deep.equal([firstConnection, secondConnection, thirdConnection]);
    });
  });
});
