import { expect } from "chai";
import * as sinon from "sinon";
import { get_object_download_url } from "./get_download_url";
import * as storage from "../../../gcp/storage";
import { Emulators } from "../../../emulator/types";
import { toContent } from "../../util";

describe("get_object_download_url tool", () => {
  const projectId = "test-project";
  const objectPath = "path/to/object.txt";
  const downloadUrl = "https://example.com/download";
  const mockHost: any = {
    getEmulatorUrl: sinon.stub(),
  };

  let getDownloadUrlStub: sinon.SinonStub;

  beforeEach(() => {
    getDownloadUrlStub = sinon.stub(storage, "getDownloadUrl");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get download URL with the default bucket", async () => {
    getDownloadUrlStub.resolves(downloadUrl);
    const result = await (get_object_download_url as any)._fn(
      { object_path: objectPath },
      { projectId, host: mockHost },
    );
    const expectedBucket = `${projectId}.firebasestorage.app`;
    expect(getDownloadUrlStub).to.be.calledWith(expectedBucket, objectPath, undefined);
    expect(result).to.deep.equal(toContent(downloadUrl));
  });

  it("should get download URL with a specified bucket", async () => {
    const bucket = "my-custom-bucket";
    getDownloadUrlStub.resolves(downloadUrl);
    const result = await (get_object_download_url as any)._fn(
      { bucket, object_path: objectPath },
      { projectId, host: mockHost },
    );
    expect(getDownloadUrlStub).to.be.calledWith(bucket, objectPath, undefined);
    expect(result).to.deep.equal(toContent(downloadUrl));
  });

  it("should use the emulator", async () => {
    const emulatorUrl = "http://localhost:9199";
    mockHost.getEmulatorUrl.withArgs(Emulators.STORAGE).resolves(emulatorUrl);
    getDownloadUrlStub.resolves(downloadUrl);

    await (get_object_download_url as any)._fn(
      { object_path: objectPath, use_emulator: true },
      { projectId, host: mockHost },
    );

    expect(mockHost.getEmulatorUrl).to.be.calledWith(Emulators.STORAGE);
    const expectedBucket = `${projectId}.firebasestorage.app`;
    expect(getDownloadUrlStub).to.be.calledWith(expectedBucket, objectPath, emulatorUrl);
  });
});
