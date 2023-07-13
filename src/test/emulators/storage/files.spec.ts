import { expect } from "chai";
import { tmpdir } from "os";
import { StoredFileMetadata } from "../../../emulator/storage/metadata";
import { createSignature, createUnsignedUrl } from "../../../emulator/storage/files";
import { StorageCloudFunctions } from "../../../emulator/storage/cloudFunctions";
import { StorageLayer } from "../../../emulator/storage/files";
import { ForbiddenError, NotFoundError, BadRequestError } from "../../../emulator/storage/errors";
import { Persistence } from "../../../emulator/storage/persistence";
import { FirebaseRulesValidator } from "../../../emulator/storage/rules/utils";
import { UploadService } from "../../../emulator/storage/upload";
import {
  SIGNED_URL_DEFAULT_TTL_MILLIS,
  SIGNED_URL_MAX_TTL_MILLIS,
} from "../../../emulator/storage/constants";
import { bucket } from "firebase-functions/v1/storage";

const ALWAYS_TRUE_RULES_VALIDATOR = {
  validate: () => Promise.resolve(true),
};

const ALWAYS_FALSE_RULES_VALIDATOR = {
  validate: async () => Promise.resolve(false),
};

const ALWAYS_TRUE_ADMIN_CREDENTIAL_VALIDATOR = {
  validate: () => true,
};

describe.only("files", () => {
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
      Buffer.from("Hello, World!")
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
      opts?: UploadFileOptions
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

    describe.only("#getObject()", () => {
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
          })
        ).to.be.rejectedWith(ForbiddenError);
      });

      it("should throw an error if the object does not exist", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
          })
        ).to.be.rejectedWith(NotFoundError);
      });

      it("should throw an error if TTL in MS aren't passed", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlUsableMs: getCurrentDate(),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if usable MS aren't passed", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlMs: 10,
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the URL has expired. TTL is 1 MS", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlMs: 1,
            urlUsableMs: getAdjustedDate(-1),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the URL has expired. TTL is 1 Week(Max)", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlMs: SIGNED_URL_MAX_TTL_MILLIS,
            urlUsableMs: getAdjustedDate(-SIGNED_URL_MAX_TTL_MILLIS),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the usable date is in the future", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlMs: 10,
            urlUsableMs: getAdjustedDate(1),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if anything in the url was changed from what it originally was", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const unsignedUrl = createUnsignedUrl({
          bucketId: "10",
          decodedObjectId: "dir%2Fobject",
          url: "localhost:9000",
          urlUsableMs: getCurrentDate(),
          urlTtlMs: SIGNED_URL_DEFAULT_TTL_MILLIS,
        });

        const signature = createSignature(unsignedUrl);

        const toChange = ["bucketId", "decodedObjectId", "url", "urlTtlMs", " urlUsableMs"];

        toChange.forEach((paramToChange) => {
          expect(
            storageLayer.getObject({
              bucketId: paramToChange === "bucketId" ? "11" : "10",
              decodedObjectId:
                paramToChange === "decodedObjectId" ? "dir%2FBadobject" : "dir%2Fobject",
              urlSignature: signature,
              url: paramToChange === "url" ? "badurl:0000" : "localhost:9000",
              urlTtlMs: paramToChange === "urlTtlMs" ? 10 : SIGNED_URL_DEFAULT_TTL_MILLIS,
              urlUsableMs: paramToChange === "urlUsableMs" ? "badDate" : getCurrentDate(),
            })
          ).to.be.rejectedWith(ForbiddenError);
        });
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
        new StorageCloudFunctions("project")
      );

    const getPersistenceTmpDir = () => `${tmpdir()}/firebase/storage/blobs`;
  });
});
function getCurrentDate(): string {
  return new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "");
}

/**
 * get the current date and add of changeBy milliseconds
 * @date 7/12/2023 - 4:28:20 PM
 *
 * @param {number} changeBy
 * @returns {string}
 */
function getAdjustedDate(changeBy: number): string {
  const newDate = new Date();
  const adjutedDate = new Date(newDate.getTime() + changeBy);

  return adjutedDate.toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "");
}
