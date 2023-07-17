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
  SECONDS_TO_MS_FACTOR,
  SIGNED_URL_DEFAULT_TTL_SECONDS,
  SIGNED_URL_MAX_TTL_SECONDS,
  SIGNED_URL_MIN_TTL_SECONDS,
} from "../../../emulator/storage/constants";

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
      it("should return data and metadata when only authenticated", async () => {
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

      it("should return data and metadata when passed a valid signature", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        await uploadFile(storageLayer, "bucket", "dir/object", {
          data: "Hello, World!",
          metadata: { contentType: "mime/type" },
        });

        const currentDate = getCurrentDate();

        const unsignedUrl = createUnsignedUrl({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
          urlTtlSeconds: 100,
          urlUsableSeconds: currentDate,
          url: "localhost:9000",
        });

        const signature = createSignature(unsignedUrl);

        const { metadata, data } = await storageLayer.getObject({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
          urlSignature: signature,
          urlTtlSeconds: 100,
          urlUsableSeconds: currentDate,
          url: "localhost:9000",
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

      it("should throw an error if TTL in Seconds aren't passed", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlUsableSeconds: getCurrentDate(),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if usable Seconds aren't passed", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlSeconds: 10,
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the URL has expired. TTL is 1 Second", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlSeconds: SIGNED_URL_MIN_TTL_SECONDS,
            urlUsableSeconds: getAdjustedDate(-1),
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
            urlTtlSeconds: SIGNED_URL_MAX_TTL_SECONDS,
            urlUsableSeconds: getAdjustedDate(-SIGNED_URL_MAX_TTL_SECONDS),
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
            urlTtlSeconds: 10,
            urlUsableSeconds: getAdjustedDate(1),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if anything in the url was changed from what it originally was", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const unsignedUrl = createUnsignedUrl({
          bucketId: "10",
          decodedObjectId: "dir%2Fobject",
          url: "localhost:9000",
          urlUsableSeconds: getCurrentDate(),
          urlTtlSeconds: SIGNED_URL_DEFAULT_TTL_SECONDS,
        });

        const signature = createSignature(unsignedUrl);

        const toChange = [
          "bucketId",
          "decodedObjectId",
          "url",
          "urlTtlSeconds",
          "urlUsableSeconds",
        ];

        toChange.forEach((paramToChange) => {
          expect(
            storageLayer.getObject({
              bucketId: paramToChange === "bucketId" ? "11" : "10",
              decodedObjectId:
                paramToChange === "decodedObjectId" ? "dir%2FBadobject" : "dir%2Fobject",
              urlSignature: signature,
              url: paramToChange === "url" ? "badurl:0000" : "localhost:9000",
              urlTtlSeconds:
                paramToChange === "urlTtlSeconds" ? 10 : SIGNED_URL_DEFAULT_TTL_SECONDS,
              urlUsableSeconds:
                paramToChange === "urlUsableSeconds" ? getAdjustedDate(-1) : getCurrentDate(),
            })
          ).to.be.rejectedWith(ForbiddenError);
        });
      });

      it("should throw an error if the ttl is not a valid type", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlSeconds: 1.3,
            urlUsableSeconds: getCurrentDate(),
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the usableSeconds is not a valid type", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            urlSignature: "mockSignature",
            urlTtlSeconds: 1.3,
            urlUsableSeconds: "invalid date",
          })
        ).to.be.rejectedWith(BadRequestError);
      });
    });

    describe.only("#generateSignedUrl", () => {
      it("should throw an error if TTL is not an integer", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.generateSignedUrl({
            bucketId: "10",
            decodedObjectId: "dir%2Fobject",
            originalUrl: "localhost:9000",
            ttlSeconds: 1.4,
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if TTL is below the min or above the max time", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        const cases = [SIGNED_URL_MIN_TTL_SECONDS, SIGNED_URL_MAX_TTL_SECONDS];

        cases.forEach((time) => {
          expect(
            storageLayer.generateSignedUrl({
              bucketId: "10",
              decodedObjectId: "dir%2Fobject",
              originalUrl: "localhost:9000",
              ttlSeconds: time === SIGNED_URL_MAX_TTL_SECONDS ? SIGNED_URL_MAX_TTL_SECONDS + 1 : 0,
            })
          ).to.be.rejectedWith(BadRequestError);
        });
      });

      it("should throw an error if request is not authorized", () => {
        const storageLayer = getStorageLayer(ALWAYS_FALSE_RULES_VALIDATOR);

        expect(
          storageLayer.generateSignedUrl({
            bucketId: "10",
            decodedObjectId: "dir%2Fobject",
            originalUrl: "localhost:9000",
            ttlSeconds: 10,
          })
        ).to.be.rejectedWith(ForbiddenError);
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
 * get the current date + changeBy SECONDS
 * @date 7/12/2023 - 4:28:20 PM
 *
 * @param {number} changeBy
 * @returns {string}
 */
function getAdjustedDate(changeBy: number): string {
  const newDate = new Date();
  const adjutedDate = new Date(newDate.getTime() + changeBy * SECONDS_TO_MS_FACTOR);

  return adjutedDate.toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "");
}
