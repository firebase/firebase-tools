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
import { RTDBRemoveRemote } from "../../database/removeRemote";

describe("RemoveRemote", () => {
  const instance = "fake-db";
  const host = "https://firebaseio.com";
  const remote = new RTDBRemoveRemote(instance, host);
  const serverUrl = utils.getDatabaseUrl(host, instance, "");

  afterEach(() => {
    nock.cleanAll();
  });

  it("should return true when patch is small", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(200, {});
    return expect(remote.deletePath("/a/b")).to.eventually.eql(true);
  });

  it("should return false whem patch is large", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    return expect(remote.deleteSubPath("/a/b", ["1", "2", "3"])).to.eventually.eql(false);
  });

  it("should return true when multi-path patch is small", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(200, {});
    return expect(remote.deleteSubPath("/a/b", ["1", "2", "3"])).to.eventually.eql(true);
  });

  it("should return false when multi-path patch is large", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    return expect(remote.deleteSubPath("/a/b", ["1", "2", "3"])).to.eventually.eql(false);
  });
});
