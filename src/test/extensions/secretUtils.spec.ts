import * as nock from "nock";
import { expect } from "chai";

import * as api from "../../api";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as secretsUtils from "../../extensions/secretsUtils";

const PROJECT_ID = "test-project";
const TEST_INSTANCE: extensionsApi.ExtensionInstance = {
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
            type: extensionsApi.ParamType.SECRET,
          },
          {
            param: "SECRET2",
            label: "secret 2",
            type: extensionsApi.ParamType.SECRET,
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
