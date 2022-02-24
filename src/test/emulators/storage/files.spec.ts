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

  it("should store file in memory when upload is finalized", () => {
    const storageLayer = new StorageLayer("project");
    const bytesToWrite = "Hello, World!";

    const upload = storageLayer.startUpload("bucket", "object", "mime/type", {
      contentType: "mime/type",
    });
    storageLayer.uploadBytes(upload.uploadId, Buffer.from(bytesToWrite));
    storageLayer.finalizeUpload(upload);

    expect(storageLayer.getBytes("bucket", "object")?.includes(bytesToWrite));
    expect(storageLayer.getMetadata("bucket", "object")?.size).equals(bytesToWrite.length);
  });

  it("should delete file from persistence layer when upload is cancelled", () => {
    const storageLayer = new StorageLayer("project");

    const upload = storageLayer.startUpload("bucket", "object", "mime/type", {
      contentType: "mime/type",
    });
    storageLayer.uploadBytes(upload.uploadId, Buffer.alloc(0));
    storageLayer.cancelUpload(upload);

    expect(storageLayer.getMetadata("bucket", "object")).to.equal(undefined);
  });
});
