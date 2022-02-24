import { expect } from "chai";
import { StoredFileMetadata } from "../../../emulator/storage/metadata";
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

  it("finishUpload persists file to memory", () => {
    const storageLayer = new StorageLayer("project");
    const { uploadId } = storageLayer.startUpload("bucket", "object", "mime/type", {
      contentType: "mime/type",
    });
    storageLayer.uploadBytes(uploadId, Buffer.alloc(0));
    storageLayer.finishUpload(uploadId);
    expect(storageLayer.getMetadata("bucket", "object")).not.to.equal(undefined);
  });
});
