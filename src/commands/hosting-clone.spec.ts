import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./hosting-clone";
import { configstore } from "../configstore";
import * as hostingApi from "../hosting/api";

describe("hosting:clone", () => {
  const PROJECT_ID = "test-project";
  const SOURCE_SITE = "source-site";
  const TARGET_SITE = "target-site";
  const CHANNEL_ID = "staging";
  const TARGET_CHANNEL_ID = "live";
  const SOURCE_VERSION = `projects/${PROJECT_ID}/sites/${SOURCE_SITE}/versions/v1`;

  let getChannelStub: sinon.SinonStub;
  let createChannelStub: sinon.SinonStub;
  let cloneVersionStub: sinon.SinonStub;
  let createReleaseStub: sinon.SinonStub;
  let addAuthDomainsStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(configstore, "get").returns({});
    getChannelStub = sinon.stub(hostingApi, "getChannel");
    createChannelStub = sinon.stub(hostingApi, "createChannel");
    cloneVersionStub = sinon.stub(hostingApi, "cloneVersion");
    createReleaseStub = sinon.stub(hostingApi, "createRelease");
    addAuthDomainsStub = sinon.stub(hostingApi, "addAuthDomains");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should clone channel to channel within the same project without using '-'", async () => {
    getChannelStub.withArgs(PROJECT_ID, SOURCE_SITE, CHANNEL_ID).resolves({
      name: `projects/${PROJECT_ID}/sites/${SOURCE_SITE}/channels/${CHANNEL_ID}`,
      url: "https://source.web.app",
      release: {
        version: {
          name: SOURCE_VERSION,
        },
      },
    } as any);

    getChannelStub.withArgs(PROJECT_ID, TARGET_SITE, TARGET_CHANNEL_ID).resolves({
      name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/channels/${TARGET_CHANNEL_ID}`,
      url: "https://target.web.app",
      release: {
        version: {
          name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v0`,
        },
      },
    } as any);

    cloneVersionStub
      .withArgs(PROJECT_ID, TARGET_SITE, SOURCE_VERSION, true)
      .resolves({ name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v1-cloned` } as any);

    createReleaseStub.resolves({} as any);

    await command.runner()(`${SOURCE_SITE}:${CHANNEL_ID}`, `${TARGET_SITE}:${TARGET_CHANNEL_ID}`, {
      project: PROJECT_ID,
    });

    expect(getChannelStub).to.have.been.calledWith(PROJECT_ID, SOURCE_SITE, CHANNEL_ID);
    expect(getChannelStub).to.have.been.calledWith(PROJECT_ID, TARGET_SITE, TARGET_CHANNEL_ID);
    expect(cloneVersionStub).to.have.been.calledWith(PROJECT_ID, TARGET_SITE, SOURCE_VERSION, true);
    expect(createReleaseStub).to.have.been.calledWith(
      PROJECT_ID,
      TARGET_SITE,
      TARGET_CHANNEL_ID,
      `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v1-cloned`,
    );

    // Verify '-' was never used in any call
    for (const call of getChannelStub.getCalls()) {
      expect(call.args[0]).to.not.equal("-");
    }
  });

  it("should support cross-project cloning without using '-'", async () => {
    const SOURCE_PROJECT = "source-project";
    const TARGET_PROJECT = "target-project";
    const CROSS_SOURCE_VERSION = `projects/${SOURCE_PROJECT}/sites/${SOURCE_SITE}/versions/v1`;

    getChannelStub.withArgs(SOURCE_PROJECT, SOURCE_SITE, CHANNEL_ID).resolves({
      name: `projects/${SOURCE_PROJECT}/sites/${SOURCE_SITE}/channels/${CHANNEL_ID}`,
      url: "https://source.web.app",
      release: {
        version: {
          name: CROSS_SOURCE_VERSION,
        },
      },
    } as any);

    getChannelStub.withArgs(TARGET_PROJECT, TARGET_SITE, TARGET_CHANNEL_ID).resolves({
      name: `projects/${TARGET_PROJECT}/sites/${TARGET_SITE}/channels/${TARGET_CHANNEL_ID}`,
      url: "https://target.web.app",
      release: {
        version: {
          name: `projects/${TARGET_PROJECT}/sites/${TARGET_SITE}/versions/v0`,
        },
      },
    } as any);

    cloneVersionStub.withArgs(TARGET_PROJECT, TARGET_SITE, CROSS_SOURCE_VERSION, true).resolves({
      name: `projects/${TARGET_PROJECT}/sites/${TARGET_SITE}/versions/v1-cloned`,
    } as any);

    createReleaseStub.resolves({} as any);

    await command.runner()(
      `${SOURCE_PROJECT}:${SOURCE_SITE}:${CHANNEL_ID}`,
      `${TARGET_PROJECT}:${TARGET_SITE}:${TARGET_CHANNEL_ID}`,
      {},
    );

    expect(getChannelStub).to.have.been.calledWith(SOURCE_PROJECT, SOURCE_SITE, CHANNEL_ID);
    expect(getChannelStub).to.have.been.calledWith(TARGET_PROJECT, TARGET_SITE, TARGET_CHANNEL_ID);
    expect(cloneVersionStub).to.have.been.calledWith(
      TARGET_PROJECT,
      TARGET_SITE,
      CROSS_SOURCE_VERSION,
      true,
    );
    expect(createReleaseStub).to.have.been.calledWith(
      TARGET_PROJECT,
      TARGET_SITE,
      TARGET_CHANNEL_ID,
      `projects/${TARGET_PROJECT}/sites/${TARGET_SITE}/versions/v1-cloned`,
    );
  });

  it("should clone from site@version source without using '-'", async () => {
    getChannelStub.withArgs(PROJECT_ID, TARGET_SITE, TARGET_CHANNEL_ID).resolves({
      name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/channels/${TARGET_CHANNEL_ID}`,
      url: "https://target.web.app",
      release: {
        version: {
          name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v0`,
        },
      },
    } as any);

    cloneVersionStub
      .withArgs(PROJECT_ID, TARGET_SITE, SOURCE_VERSION, true)
      .resolves({ name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v1-cloned` } as any);

    createReleaseStub.resolves({} as any);

    await command.runner()(`${SOURCE_SITE}@v1`, `${TARGET_SITE}:${TARGET_CHANNEL_ID}`, {
      project: PROJECT_ID,
    });

    expect(cloneVersionStub).to.have.been.calledWith(PROJECT_ID, TARGET_SITE, SOURCE_VERSION, true);
    expect(createReleaseStub).to.have.been.calledWith(
      PROJECT_ID,
      TARGET_SITE,
      TARGET_CHANNEL_ID,
      `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v1-cloned`,
    );
  });

  it("should create channel if target channel does not exist", async () => {
    getChannelStub.withArgs(PROJECT_ID, SOURCE_SITE, CHANNEL_ID).resolves({
      name: `projects/${PROJECT_ID}/sites/${SOURCE_SITE}/channels/${CHANNEL_ID}`,
      url: "https://source.web.app",
      release: {
        version: {
          name: SOURCE_VERSION,
        },
      },
    } as any);

    getChannelStub.withArgs(PROJECT_ID, TARGET_SITE, TARGET_CHANNEL_ID).resolves(null);

    createChannelStub.withArgs(PROJECT_ID, TARGET_SITE, TARGET_CHANNEL_ID).resolves({
      name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/channels/${TARGET_CHANNEL_ID}`,
      url: "https://target.web.app",
    } as any);

    cloneVersionStub
      .withArgs(PROJECT_ID, TARGET_SITE, SOURCE_VERSION, true)
      .resolves({ name: `projects/${PROJECT_ID}/sites/${TARGET_SITE}/versions/v1-cloned` } as any);

    createReleaseStub.resolves({} as any);
    addAuthDomainsStub.resolves();

    await command.runner()(`${SOURCE_SITE}:${CHANNEL_ID}`, `${TARGET_SITE}:${TARGET_CHANNEL_ID}`, {
      project: PROJECT_ID,
    });

    expect(createChannelStub).to.have.been.calledWith(PROJECT_ID, TARGET_SITE, TARGET_CHANNEL_ID);
    expect(addAuthDomainsStub).to.have.been.calledWith(PROJECT_ID, ["https://target.web.app"]);
  });

  it("should reject when source and destination are identical", async () => {
    await expect(
      command.runner()(`${SOURCE_SITE}:${CHANNEL_ID}`, `${SOURCE_SITE}:${CHANNEL_ID}`, {
        project: PROJECT_ID,
      }),
    ).to.be.rejectedWith(/Source and destination cannot be equal/);
  });
});
