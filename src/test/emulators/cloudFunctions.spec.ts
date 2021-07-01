import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { AuthCloudFunction } from "../../emulator/auth/cloudFunctions";
import { EmulatorRegistry } from "../../emulator/registry";
import { Emulators } from "../../emulator/types";
import { FakeEmulator } from "./fakeEmulator";

describe("cloudFunctions", () => {
  describe("dispatch", () => {
    let sandbox: sinon.SinonSandbox;
    const fakeEmulator = new FakeEmulator(Emulators.FUNCTIONS, "1.1.1.1", 4);
    before(() => {
      sandbox = sinon.createSandbox();
      sandbox.stub(EmulatorRegistry, "get").returns(fakeEmulator);
    });

    after(() => {
      sandbox.restore();
      nock.cleanAll();
    });

    it("should make a request to the functions emulator", async () => {
      nock("http://1.1.1.1:4")
        .post("/functions/projects/project-foo/trigger_multicast", {
          eventId: /.*/,
          eventType: "providers/firebase.auth/eventTypes/user.create",
          resource: {
            name: "projects/project-foo",
            service: "firebaseauth.googleapis.com",
          },
          params: {},
          timestamp: /.*/,
          data: { uid: "foobar", metadata: {}, customClaims: {} },
        })
        .reply(200, {});

      const cf = new AuthCloudFunction("project-foo");
      await cf.dispatch("create", { localId: "foobar" });
      expect(nock.isDone()).to.be.true;
    });
  });
});
