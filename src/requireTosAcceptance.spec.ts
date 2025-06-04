import * as nock from "nock";
import * as sinon from "sinon";
import { APPHOSTING_TOS_ID, APP_CHECK_TOS_ID } from "./gcp/firedata";
import { requireTosAcceptance } from "./requireTosAcceptance";
import { Options } from "./options";
import { RC } from "./rc";
import { expect } from "chai";
import * as auth from "./auth";

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
  let loggedInStub: sinon.SinonStub;
  beforeEach(() => {
    nock.disableNetConnect();
    loggedInStub = sinon.stub(auth, "loggedIn");
  });
  afterEach(() => {
    nock.enableNetConnect();
    loggedInStub.restore();
  });

  it("should resolve for accepted terms of service", async () => {
    nock("https://mobilesdk-pa.googleapis.com")
      .get("/v1/accessmanagement/tos:getStatus")
      .reply(200, SAMPLE_RESPONSE);
    loggedInStub.returns(true);

    await requireTosAcceptance(APP_CHECK_TOS_ID)(SAMPLE_OPTIONS);

    expect(nock.isDone()).to.be.true;
  });

  it("should throw error if not accepted", async () => {
    nock("https://mobilesdk-pa.googleapis.com")
      .get("/v1/accessmanagement/tos:getStatus")
      .reply(200, SAMPLE_RESPONSE);
    loggedInStub.returns(true);

    await expect(requireTosAcceptance(APPHOSTING_TOS_ID)(SAMPLE_OPTIONS)).to.be.rejectedWith(
      "Terms of Service",
    );

    expect(nock.isDone()).to.be.true;
  });

  it("should resolve to if not a human", async () => {
    loggedInStub.returns(false);

    await requireTosAcceptance(APPHOSTING_TOS_ID)(SAMPLE_OPTIONS);

    expect(nock.isDone()).to.be.true;
  });
});
