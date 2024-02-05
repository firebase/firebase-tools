import { expect } from "chai";
import { tmpdir } from "os";

import { StoredFileMetadata } from "../../../emulator/storage/metadata";
import { StorageCloudFunctions } from "../../../emulator/storage/cloudFunctions";
import { StorageLayer } from "../../../emulator/storage/files";
import { ForbiddenError, NotFoundError } from "../../../emulator/storage/errors";
import { Persistence } from "../../../emulator/storage/persistence";
import { FirebaseRulesValidator } from "../../../emulator/storage/rules/utils";
import { UploadService } from "../../../emulator/storage/upload";

const ALWAYS_TRUE_RULES_VALIDATOR = {
  validate: () => Promise.resolve(true),
};

const ALWAYS_FALSE_RULES_VALIDATOR = {
  validate: async () => Promise.resolve(false),
};

const ALWAYS_TRUE_ADMIN_CREDENTIAL_VALIDATOR = {
  validate: () => true,
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
      Buffer.from("Hello, World!"),
    );

    const json = StoredFileMetadata.toJSON(metadata);
    const deserialized = StoredFileMetadata.fromJSON(json, cf);
    expect(deserialized).to.deep.equal(metadata);
  });

  it("converts non-string custom metadata to string", () => {
    const cf = new StorageCloudFunctions("demo-project");
    const customMetadata = {
      foo: true as unknown as string,
    };
    const metadata = new StoredFileMetadata(
      {
        customMetadata,
        name: "name",
        bucket: "bucket",
        contentType: "mime/type",
        downloadTokens: ["token123"],
      },
      cf,
      Buffer.from("Hello, World!"),
    );
    const json = StoredFileMetadata.toJSON(metadata);
    const deserialized = StoredFileMetadata.fromJSON(json, cf);
    expect(deserialized.customMetadata).to.deep.equal({ foo: "true" });
  });

  describe("StorageLayer", () => {
    let _persistence: Persistence;
    let _uploadService: UploadService;

    type UploadFileOptions = {
      data?: string;
      metadata?: Object;
    };

    async function uploadFile(
      storageLayer: StorageLayer,
      bucketId: string,
      objectId: string,
      opts?: UploadFileOptions,
    ) {
      const upload = _uploadService.multipartUpload({
        bucketId,
        objectId: encodeURIComponent(objectId),
        dataRaw: Buffer.from(opts?.data ?? "hello world"),
        metadata: opts?.metadata ?? {},
      });
      await storageLayer.uploadObject(upload);
    }

    beforeEach(() => {
      _persistence = new Persistence(getPersistenceTmpDir());
      _uploadService = new UploadService(_persistence);
    });

    describe("#uploadObject()", () => {
      it("should throw if upload is not finished", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const upload = _uploadService.startResumableUpload({
          bucketId: "bucket",
          objectId: "dir%2Fobject",
          metadata: {},
        });

        expect(storageLayer.uploadObject(upload)).to.be.rejectedWith("Unexpected upload status");
      });

      it("should throw if upload is not authorized", () => {
        const storageLayer = getStorageLayer(ALWAYS_FALSE_RULES_VALIDATOR);
        const uploadId = _uploadService.startResumableUpload({
          bucketId: "bucket",
          objectId: "dir%2Fobject",
          metadata: {},
        }).id;
        _uploadService.continueResumableUpload(uploadId, Buffer.from("hello world"));
        const upload = _uploadService.finalizeResumableUpload(uploadId);

        expect(storageLayer.uploadObject(upload)).to.be.rejectedWith(ForbiddenError);
      });
    });

    describe("#getObject()", () => {
      it("should return data and metadata", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        await uploadFile(storageLayer, "bucket", "dir/object", {
          data: "Hello, World!",
          metadata: { contentType: "mime/type" },
        });

        const { metadata, data } = await storageLayer.getObject({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
        });

        expect(metadata.contentType).to.equal("mime/type");
        expect(data.toString()).to.equal("Hello, World!");
      });

      it("should throw an error if request is not authorized", () => {
        const storageLayer = getStorageLayer(ALWAYS_FALSE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
          }),
        ).to.be.rejectedWith(ForbiddenError);
      });

      it("should throw an error if the object does not exist", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
          }),
        ).to.be.rejectedWith(NotFoundError);
      });
    });

    const getStorageLayer = (rulesValidator: FirebaseRulesValidator) =>
      new StorageLayer(
        "project",
        new Map(),
        new Map(),
        rulesValidator,
        ALWAYS_TRUE_ADMIN_CREDENTIAL_VALIDATOR,
        _persistence,
        new StorageCloudFunctions("project"),
      );

    const getPersistenceTmpDir = () => `${tmpdir()}/firebase/storage/blobs`;
  });
});
