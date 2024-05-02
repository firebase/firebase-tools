import * as nock from "nock";
import { APPHOSTING_TOS_ID, APP_CHECK_TOS_ID } from "../gcp/firedata";
import requireTosAcceptance from "../requireTosAcceptance";
import { Options } from "../options";
import { RC } from "../rc";
import { expect } from "chai";

const SAMPLE_OPTIONS: Options = {
  cwd: "/",
  configPath: "/",
  /* eslint-disable-next-line */
  config: {} as any,
  only: "",
  except: "",
  nonInteractive: false,
  json: false,
  interactive: false,
  debug: false,
  force: false,
  filteredTargets: [],
  rc: new RC(),
};

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

describe("requireTosAcceptance", () => {
  before(() => {
    nock.disableNetConnect();
  });
  after(() => {
    nock.enableNetConnect();
  });

  it("should resolve for accepted terms of service", async () => {
    nock("https://mobilesdk-pa.googleapis.com")
      .get("/v1/accessmanagement/tos:getStatus")
      .reply(200, SAMPLE_RESPONSE);

    await requireTosAcceptance(APP_CHECK_TOS_ID)(SAMPLE_OPTIONS);
  });

  it("should throw error if not accepted", async () => {
    nock("https://mobilesdk-pa.googleapis.com")
      .get("/v1/accessmanagement/tos:getStatus")
      .reply(200, SAMPLE_RESPONSE);

    await expect(requireTosAcceptance(APPHOSTING_TOS_ID)(SAMPLE_OPTIONS)).to.be.rejectedWith(
      "Your account is missing the required terms of service for this action. Please accept the Terms of Service and try again. https://console.firebase.google.com/project/_/apphosting",
    );
  });
});
