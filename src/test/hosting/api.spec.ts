import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";
import * as helpers from "../helpers";
import * as api from "../../api";
import * as hostingApi from "../../hosting/api";

const TEST_CHANNELS_RESPONSE = {
  channels: [
    // domain exists in TEST_GET_DOMAINS_RESPONSE
    { url: "https://my-site--ch1-4iyrl1uo.web.app" },
    // domain does not exist in TEST_GET_DOMAINS_RESPONSE
    // we assume this domain was manually removed by
    // the user from the identity api
    { url: "https://my-site--ch2-ygd8582v.web.app" },
  ],
};
const TEST_GET_DOMAINS_RESPONSE = {
  authorizedDomains: [
    "my-site.firebaseapp.com",
    "localhost",
    "randomurl.com",
    "my-site--ch1-4iyrl1uo.web.app",
    // domain that should be removed
    "my-site--expiredchannel-difhyc76.web.app",
  ],
};

const EXPECTED_DOMAINS_RESPONSE = [
  "my-site.firebaseapp.com",
  "localhost",
  "randomurl.com",
  "my-site--ch1-4iyrl1uo.web.app",
];
const PROJECT_ID = "test-project";
const SITE = "my-site";

describe("hosting", () => {
  beforeEach(() => {
    helpers.mockAuth(sinon);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getCleanDomains", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should return the list of expected auth domains after syncing", async () => {
      // mock listChannels response
      nock(api.hostingApiOrigin)
        .get(`/v1beta1/projects/${PROJECT_ID}/sites/${SITE}/channels`)
        .query((p: any) => p.pageSize === "100")
        .reply(200, TEST_CHANNELS_RESPONSE);
      // mock getAuthDomains response
      nock(api.identityOrigin)
        .get(`/admin/v2/projects/${PROJECT_ID}/config`)
        .reply(200, TEST_GET_DOMAINS_RESPONSE);

      const res = await hostingApi.getCleanDomains(PROJECT_ID, SITE);

      expect(res).to.deep.equal(EXPECTED_DOMAINS_RESPONSE);
      expect(nock.isDone()).to.be.true;
    });
  });
});
