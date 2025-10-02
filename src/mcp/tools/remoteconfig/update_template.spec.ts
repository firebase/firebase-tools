import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as api from "../../../api";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces";
import { update_template } from "./update_template";
import { toContent } from "../../util";
import { McpContext } from "../../types";

const PROJECT_ID = "the-remote-config-project";
const TEMPLATE: RemoteConfigTemplate = {
  conditions: [],
  parameters: {},
  parameterGroups: {},
  etag: "whatever",
  version: {
    versionNumber: "1",
    updateTime: "2020-01-01T12:00:00.000000Z",
    updateUser: {
      email: "someone@google.com",
    },
    updateOrigin: "CONSOLE",
    updateType: "INCREMENTAL_UPDATE",
  },
};

describe("update_template", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should publish the latest template", async () => {
    nock(api.remoteConfigApiOrigin())
      .put(`/v1/projects/${PROJECT_ID}/remoteConfig`)
      .reply(200, TEMPLATE);

    const result = await update_template.fn({ template: TEMPLATE }, {
      projectId: PROJECT_ID,
    } as any as McpContext);
    expect(result).to.deep.equal(toContent(TEMPLATE));
  });

  it("should publish the latest template with * etag", async () => {
    nock(api.remoteConfigApiOrigin())
      .put(`/v1/projects/${PROJECT_ID}/remoteConfig`, undefined, {
        reqheaders: {
          "If-Match": "*",
        },
      })
      .reply(200, TEMPLATE);

    const result = await update_template.fn({ template: TEMPLATE, force: true }, {
      projectId: PROJECT_ID,
    } as any as McpContext);
    expect(result).to.deep.equal(toContent(TEMPLATE));
  });

  it("should reject if the publish api call fails", async () => {
    nock(api.remoteConfigApiOrigin()).put(`/v1/projects/${PROJECT_ID}/remoteConfig`).reply(404, {});

    await expect(
      update_template.fn({ template: TEMPLATE }, { projectId: PROJECT_ID } as any as McpContext),
    ).to.be.rejected;
  });

  it("should return a rollback to the version number specified", async () => {
    nock(api.remoteConfigApiOrigin())
      .post(`/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=1`)
      .reply(200, TEMPLATE);

    const result = await update_template.fn({ version_number: 1 }, {
      projectId: PROJECT_ID,
    } as any as McpContext);
    expect(result).to.deep.equal(toContent(TEMPLATE));
  });

  it("should reject if the rollback api call fails", async () => {
    nock(api.remoteConfigApiOrigin())
      .post(`/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=1`)
      .reply(404, {});

    await expect(
      update_template.fn({ version_number: 1 }, { projectId: PROJECT_ID } as any as McpContext),
    ).to.be.rejected;
  });
});
