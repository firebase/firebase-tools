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

import * as nock from "nock";
import { expect } from "chai";

import * as api from "../../api";
import { ExtensionInstance, ParamType } from "../../extensions/types";
import * as secretsUtils from "../../extensions/secretsUtils";

const PROJECT_ID = "test-project";
const TEST_INSTANCE: ExtensionInstance = {
  name: "projects/invader-zim/instances/image-resizer",
  createTime: "2019-05-19T00:20:10.416947Z",
  updateTime: "2019-05-19T00:20:10.416947Z",
  state: "ACTIVE",
  serviceAccountEmail: "service@account.com",
  config: {
    name: "projects/invader-zim/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
    createTime: "2019-05-19T00:20:10.416947Z",
    source: {
      name: "",
      state: "ACTIVE",
      packageUri: "url",
      hash: "hash",
      spec: {
        name: "test",
        displayName: "Old",
        description: "descriptive",
        version: "1.0.0",
        license: "MIT",
        resources: [],
        author: { authorName: "Tester" },
        contributors: [{ authorName: "Tester 2" }],
        billingRequired: true,
        sourceUrl: "test.com",
        params: [
          {
            param: "SECRET1",
            label: "secret 1",
            type: ParamType.SECRET,
          },
          {
            param: "SECRET2",
            label: "secret 2",
            type: ParamType.SECRET,
          },
        ],
      },
    },
    params: {
      SECRET1: "projects/test-project/secrets/secret1/versions/1",
      SECRET2: "projects/test-project/secrets/secret2/versions/1",
    },
  },
};

describe("secretsUtils", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("getManagedSecrets", () => {
    it("only returns secrets that have labels set", async () => {
      nock(api.secretManagerOrigin)
        .get(`/v1/projects/${PROJECT_ID}/secrets/secret1`)
        .reply(200, {
          name: `projects/${PROJECT_ID}/secrets/secret1`,
          labels: { "firebase-extensions-managed": "true" },
        });
      nock(api.secretManagerOrigin)
        .get(`/v1/projects/${PROJECT_ID}/secrets/secret2`)
        .reply(200, {
          name: `projects/${PROJECT_ID}/secrets/secret2`,
        }); // no labels

      expect(await secretsUtils.getManagedSecrets(TEST_INSTANCE)).to.deep.equal([
        "projects/test-project/secrets/secret1/versions/1",
      ]);

      expect(nock.isDone()).to.be.true;
    });
  });
});
