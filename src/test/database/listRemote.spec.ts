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

import * as utils from "../../utils";
import { realtimeOrigin } from "../../api";
import { RTDBListRemote } from "../../database/listRemote";
const HOST = "https://firebaseio.com";

describe("ListRemote", () => {
  const instance = "fake-db";
  const remote = new RTDBListRemote(instance, HOST);
  const serverUrl = utils.addSubdomain(realtimeOrigin, instance);

  afterEach(() => {
    nock.cleanAll();
  });

  it("should return subpaths from shallow get request", async () => {
    nock(serverUrl).get("/.json").query({ shallow: true, limitToFirst: "1234" }).reply(200, {
      a: true,
      x: true,
      f: true,
    });
    await expect(remote.listPath("/", 1234)).to.eventually.eql(["a", "x", "f"]);
  });
});
