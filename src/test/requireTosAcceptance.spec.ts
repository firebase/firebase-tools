// import { expect } from "chai";
import * as nock from "nock";
import { /* APPHOSTING_TOS_ID,*/ APP_CHECK_TOS_ID } from "../gcp/firedata";
import requireTosAcceptance from "../requireTosAcceptance";
import { Options } from "../options";
import { RC } from "../rc";

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
  overallStatus: "ACCEPTED",
  uTosStatus: {
    tos: {
      id: "firebase",
      tosId: "FIREBASE_UNIVERSAL",
    },
    status: "ACCEPTED",
  },
  childTosStatus: [
    {
      tos: {
        id: "cloud",
        tosId: "CLOUD_PLATFORM",
      },
      status: "ACCEPTED",
    },
    {
      tos: {
        id: "firebase_b2b",
        tosId: "FIREBASE_B2B",
      },
      status: "ACCEPTED",
    },
    {
      tos: {
        id: "universal",
        tosId: "GOOGLE_APIS",
      },
      status: "ACCEPTED",
    },
  ],
  termsUrl: "https://firebase.google.com/terms",
  perServiceStatus: [
    {
      tosId: "APP_CHECK",
      serviceStatus: {
        tos: {
          id: "app_check",
          tosId: "APP_CHECK",
        },
        status: "TERMS_UPDATED",
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
    {
      tosId: "FIREBASE_CRASHLYTICS_APP_DISTRIBUTION",
      serviceStatus: {
        tos: {
          id: "firebase_crashlytics_app_distribution",
          tosId: "FIREBASE_CRASHLYTICS_APP_DISTRIBUTION",
        },
        status: "ACCEPTED",
      },
    },
  ],
};

describe.only("requireTosAcceptance", () => {
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
});
