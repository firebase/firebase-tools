import { expect } from "chai";
import { StoredFileMetadata, CloudStorageBucketMetadata } from "../../../emulator/storage/metadata";
import { StorageCloudFunctions } from "../../../emulator/storage/cloudFunctions";
import { StorageLayer } from "../../../emulator/storage/files";

describe("files", () => {
  it("can serialize and deserialize metadata", () => {
    const cf = new StorageCloudFunctions("demo-project");
    const metadata = new StoredFileMetadata(
      {
        name: "name",
        bucket: "bucket",
        contentType: "mime/type",
        downloadTokens: ["token123"],
        customMetadata: {
          foo: "bar",
        },
      },
      cf,
      Buffer.from("Hello, World!")
    );

    const json = StoredFileMetadata.toJSON(metadata);
    const deserialized = StoredFileMetadata.fromJSON(json, cf);
    expect(deserialized).to.deep.equal(metadata);
  });

  it("can create a bucket and return its metadata", () => {
    const metadata = new CloudStorageBucketMetadata("demo-bucket");
    const storageLayer = new StorageLayer("demo-project");

    const received = storageLayer.getBucketMetadata("demo-bucket");

    expect(received).to.deep.equal(metadata);
  });
});
