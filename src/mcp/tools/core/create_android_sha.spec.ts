import { expect } from "chai";
import * as sinon from "sinon";
import { create_android_sha } from "./create_android_sha";
import * as apps from "../../../management/apps";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";

describe("create_android_sha tool", () => {
  const projectId = "test-project";
  const appId = "test-app-id";
  const sha1Hash = "A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2";
  const sha256Hash =
    "A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2";
  const unspecifiedHash = "invalid-hash";

  let createAppAndroidShaStub: sinon.SinonStub;

  beforeEach(() => {
    createAppAndroidShaStub = sinon.stub(apps, "createAppAndroidSha");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should add a SHA-1 hash", async () => {
    const shaCertificate = { name: "sha-cert" };
    createAppAndroidShaStub.resolves(shaCertificate);

    const result = await create_android_sha.fn({ app_id: appId, sha_hash: sha1Hash }, {
      projectId,
    } as ServerToolContext);

    expect(createAppAndroidShaStub).to.be.calledWith(projectId, appId, {
      shaHash: sha1Hash,
      certType: "SHA_1",
    });
    expect(result).to.deep.equal(
      toContent({
        ...shaCertificate,
        message: `Successfully added SHA_1 certificate to Android app ${appId}`,
      }),
    );
  });

  it("should add a SHA-256 hash", async () => {
    const shaCertificate = { name: "sha-cert" };
    createAppAndroidShaStub.resolves(shaCertificate);

    const result = await create_android_sha.fn({ app_id: appId, sha_hash: sha256Hash }, {
      projectId,
    } as ServerToolContext);

    expect(createAppAndroidShaStub).to.be.calledWith(projectId, appId, {
      shaHash: sha256Hash,
      certType: "SHA_256",
    });
    expect(result).to.deep.equal(
      toContent({
        ...shaCertificate,
        message: `Successfully added SHA_256 certificate to Android app ${appId}`,
      }),
    );
  });

  // TODO(@joehan): Should this actually throw an error instead?
  // should we adjust the tool to throw an error here and maybe validate before
  // passing it to the server?
  it("should handle an unspecified hash type", async () => {
    const shaCertificate = { name: "sha-cert" };
    createAppAndroidShaStub.resolves(shaCertificate);

    const result = await create_android_sha.fn({ app_id: appId, sha_hash: unspecifiedHash }, {
      projectId,
    } as ServerToolContext);

    expect(createAppAndroidShaStub).to.be.calledWith(projectId, appId, {
      shaHash: unspecifiedHash,
      certType: "SHA_CERTIFICATE_TYPE_UNSPECIFIED",
    });
    expect(result).to.deep.equal(
      toContent({
        ...shaCertificate,
        message: `Successfully added SHA_CERTIFICATE_TYPE_UNSPECIFIED certificate to Android app ${appId}`,
      }),
    );
  });
});
