/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
