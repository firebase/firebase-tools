import { expect } from "chai";
import { StoredFileMetadata } from "../../../emulator/storage/metadata";
import { StorageCloudFunctions } from "../../../emulator/storage/cloudFunctions";
import { StorageLayer } from "../../../emulator/storage/files";
import { ForbiddenError, NotFoundError } from "../../../emulator/storage/errors";

const ALWAYS_TRUE_RULES_VALIDATOR = {
  validate: () => Promise.resolve(true),
};

const ALWAYS_FALSE_RULES_VALIDATOR = {
  validate: async () => Promise.resolve(false),
};

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
    const storageLayer = new StorageLayer("project", ALWAYS_TRUE_RULES_VALIDATOR);
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
    const storageLayer = new StorageLayer("project", ALWAYS_TRUE_RULES_VALIDATOR);

    const upload = storageLayer.startUpload("bucket", "object", "mime/type", {
      contentType: "mime/type",
    });
    storageLayer.uploadBytes(upload.uploadId, Buffer.alloc(0));
    storageLayer.cancelUpload(upload);

    expect(storageLayer.getMetadata("bucket", "object")).to.equal(undefined);
  });

  describe("#handleGetObject()", () => {
    it("should return data and metadata", async () => {
      const storageLayer = new StorageLayer("project", ALWAYS_TRUE_RULES_VALIDATOR);
      storageLayer.oneShotUpload(
        "bucket",
        "dir%2Fobject",
        "mime/type",
        {
          contentType: "mime/type",
        },
        Buffer.from("Hello, World!")
      );

      const { metadata, data } = await storageLayer.handleGetObject({
        bucketId: "bucket",
        decodedObjectId: "dir%2Fobject",
      });

      expect(metadata.contentType).to.equal("mime/type");
      expect(data.toString()).to.equal("Hello, World!");
    });

    it("should throw an error if request is not authorized", () => {
      const storageLayer = new StorageLayer("project", ALWAYS_FALSE_RULES_VALIDATOR);

      expect(
        storageLayer.handleGetObject({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
        })
      ).to.be.rejectedWith(ForbiddenError);
    });

    it("should throw an error if the object does not exist", () => {
      const storageLayer = new StorageLayer("project", ALWAYS_TRUE_RULES_VALIDATOR);

      expect(
        storageLayer.handleGetObject({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
        })
      ).to.be.rejectedWith(NotFoundError);
    });
  });
});
