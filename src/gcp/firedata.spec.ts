import * as nock from "nock";
import {
  APPHOSTING_TOS_ID,
  APP_CHECK_TOS_ID,
  GetTosStatusResponse,
  getAcceptanceStatus,
  getTosStatus,
  isProductTosAccepted,
} from "./firedata";
import { expect } from "chai";

const SAMPLE_RESPONSE = {
  perServiceStatus: [
    {
      tosId: "APP_CHECK",
      serviceStatus: {
        tos: {
          id: "app_check",
          tosId: "APP_CHECK",
        },
        status: "ACCEPTED",
      },
    },
    {
      tosId: "APP_HOSTING_TOS",
      serviceStatus: {
        tos: {
          id: "app_hosting",
          tosId: "APP_HOSTING_TOS",
        },
        status: "TERMS_UPDATED",
      },
    },
  ],
};

describe("firedata", () => {
  before(() => {
    nock.disableNetConnect();
  });
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("getTosStatus", () => {
    it("should return parsed GetTosStatusResponse", async () => {
      nock("https://mobilesdk-pa.googleapis.com")
        .get("/v1/accessmanagement/tos:getStatus")
        .reply(200, SAMPLE_RESPONSE);

      await expect(getTosStatus()).to.eventually.deep.equal(
        SAMPLE_RESPONSE as GetTosStatusResponse,
      );
    });
  });

  describe("getAcceptanceStatus", () => {
    it("should return the status", () => {
      const res = SAMPLE_RESPONSE as GetTosStatusResponse;
      expect(getAcceptanceStatus(res, APP_CHECK_TOS_ID)).to.equal("ACCEPTED");
      expect(getAcceptanceStatus(res, APPHOSTING_TOS_ID)).to.equal("TERMS_UPDATED");
    });
  });

  describe("isProductTosAccepted", () => {
    it("should determine whether tos is accepted", () => {
      const res = SAMPLE_RESPONSE as GetTosStatusResponse;
      expect(isProductTosAccepted(res, APP_CHECK_TOS_ID)).to.equal(true);
      expect(isProductTosAccepted(res, APPHOSTING_TOS_ID)).to.equal(false);
    });
  });
});
