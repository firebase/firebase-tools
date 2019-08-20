import { expect } from "chai";
import * as sinon from "sinon";
import { AppDistributionRequests } from "../../appdistribution/requests";
import { FirebaseError } from "../../error";

describe("distribution", () => {
  const appId = "1:12345789:ios:abc123def456";
  const distribution = new AppDistributionRequests(appId);

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("pollReleaseIdByHash", () => {
    beforeEach(() => {
      sandbox.stub(distribution, "getReleaseIdByHash").rejects(new Error("Can't find release"));
    });

    it("should throw a Firebase Error if retry count >= AppDistributionRequests.MAX_POLLING_RETRIES", () => {
      return expect(
        distribution.pollReleaseIdByHash("mock-hash", AppDistributionRequests.MAX_POLLING_RETRIES)
      ).to.be.rejectedWith(FirebaseError, "Can't find release");
    });
  });
});
