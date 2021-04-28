import { expect } from "chai";
import { StoredFileMetadata } from "../../../emulator/storage/metadata";
import { StorageCloudFunctions } from "../../../emulator/storage/cloudFunctions";

describe("files", () => {
  it("can serialize and deserialize metadata", () => {
    const cf = new StorageCloudFunctions("demo-project");
    const metadata = new StoredFileMetadata(
      Buffer.from('Hello, World!'),
      {
        name: "name",
        bucket: "bucket",
        contentType: "mime/type",
      },
      undefined,
      cf
    );

    const json = StoredFileMetadata.toJSON(metadata);
    const deserialized = StoredFileMetadata.fromJSON(json, cf);
    expect(deserialized).to.deep.equal(metadata);
  });
});
