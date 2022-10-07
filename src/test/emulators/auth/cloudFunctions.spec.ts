import { expect } from "chai";
import * as nock from "nock";

import { AuthCloudFunction } from "../../../emulator/auth/cloudFunctions";
import { findAvailablePort } from "../../../emulator/portUtils";
import { EmulatorRegistry } from "../../../emulator/registry";
import { Emulators } from "../../../emulator/types";
import { FakeEmulator } from "../fakeEmulator";

describe("cloudFunctions", () => {
  describe("dispatch", () => {
    const host = "localhost";
    let port = 4000;
    before(async () => {
      port = await findAvailablePort(host, port);

      const emu = new FakeEmulator(Emulators.FUNCTIONS, host, port);
      await EmulatorRegistry.start(emu);
      nock(EmulatorRegistry.url(Emulators.FUNCTIONS).toString())
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
    });

    after(async () => {
      await EmulatorRegistry.stopAll();
      nock.cleanAll();
    });

    it("should make a request to the functions emulator", async () => {
      const cf = new AuthCloudFunction("project-foo");
      await cf.dispatch("create", { localId: "foobar" });
      expect(nock.isDone()).to.be.true;
    });
  });
});
