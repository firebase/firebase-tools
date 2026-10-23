import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import { command } from "./hosting-disable";
import { configstore } from "../configstore";
import { hostingApiOrigin } from "../api";
import * as prompt from "../prompt";
import * as ensureApiModule from "../ensureApiEnabled";

describe("hosting:disable", () => {
  const PROJECT_ID = "test-project";
  const SITE = "test-site";

  let confirmStub: sinon.SinonStub;
  let ensureApiStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(configstore, "get").returns({});
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
    ensureApiStub = sinon.stub(ensureApiModule, "ensure").resolves();
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  it("should disable hosting site with project-scoped release request", async () => {
    nock(hostingApiOrigin())
      .post(`/v1beta1/projects/${PROJECT_ID}/sites/${SITE}/releases`, {
        type: "SITE_DISABLE",
      })
      .reply(200, {});

    await command.runner()({ project: PROJECT_ID, site: SITE });

    expect(nock.isDone()).to.be.true;
    expect(confirmStub).to.have.been.calledOnce;
    expect(ensureApiStub).to.have.been.calledOnceWith(
      PROJECT_ID,
      hostingApiOrigin(),
      "hosting",
      true,
    );
  });

  it("should not make a request if not confirmed", async () => {
    confirmStub.resolves(false);

    await command.runner()({ project: PROJECT_ID, site: SITE });

    expect(nock.isDone()).to.be.true;
    expect(ensureApiStub).to.have.been.calledOnceWith(
      PROJECT_ID,
      hostingApiOrigin(),
      "hosting",
      true,
    );
  });
});
