import { expect } from "chai";
import { tmpdir } from "os";
import { StoredFileMetadata } from "../../../emulator/storage/metadata";
import {
  createSignature,
  createUnsignedUrl,
  getCurrentDate,
  getSignedUrlTimestampFor,
} from "../../../emulator/storage/files";
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

    describe("#getObject()", () => {
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

        expect("mime/type").to.equal(metadata.contentType);
        expect("Hello, World!").to.equal(data.toString());
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
          ttlSeconds: 100,
          usableSeconds: currentDate,
          url: "localhost:9000",
        });

        const signature = createSignature(unsignedUrl);

        const { metadata, data } = await storageLayer.getObject({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
          signedUrl: {
            signature: signature,
            ttlSeconds: 100,
            usableSeconds: currentDate,
            base: "localhost:9000",
          },
        });

        expect("mime/type").to.equal(metadata.contentType);
        expect("Hello, World!").to.equal(data.toString());
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

      it("should throw an error if missing TTL", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            signedUrl: {
              signature: "mockSignature",
              usableSeconds: getCurrentDate(),
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if usable Seconds aren't passed", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            signedUrl: {
              signature: "mockSignature",
              ttlSeconds: 10,
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the URL has expired. TTL is 1 Second", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            signedUrl: {
              signature: "mockSignature",
              ttlSeconds: SIGNED_URL_MIN_TTL_SECONDS,
              usableSeconds: getAdjustedDate(-1),
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the URL has expired. TTL is 1 Week(Max)", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            signedUrl: {
              signature: "mockSignature",
              ttlSeconds: SIGNED_URL_MAX_TTL_SECONDS,
              usableSeconds: getAdjustedDate(-SIGNED_URL_MAX_TTL_SECONDS),
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the usable date is in the future", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            signedUrl: {
              signature: "mockSignature",
              ttlSeconds: 10,
              usableSeconds: getAdjustedDate(1),
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if anything in the url was changed from what it originally was", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const unsignedUrl = createUnsignedUrl({
          bucketId: "10",
          decodedObjectId: "dir%2Fobject",
          url: "localhost:9000",
          usableSeconds: getCurrentDate(),
          ttlSeconds: SIGNED_URL_DEFAULT_TTL_SECONDS,
        });

        const signature = createSignature(unsignedUrl);

        const toChange = ["bucketId", "decodedObjectId", "url", "ttlSeconds", "usableSeconds"];

        toChange.forEach((paramToChange) => {
          expect(
            storageLayer.getObject({
              bucketId: paramToChange === "bucketId" ? "11" : "10",
              decodedObjectId:
                paramToChange === "decodedObjectId" ? "dir%2FBadobject" : "dir%2Fobject",
              signedUrl: {
                signature: signature,
                ttlSeconds: paramToChange === "ttlSeconds" ? 10 : SIGNED_URL_DEFAULT_TTL_SECONDS,
                usableSeconds:
                  paramToChange === "usableSeconds" ? getAdjustedDate(-1) : getCurrentDate(),
                base: paramToChange === "url" ? "badurl:0000" : "localhost:9000",
              },
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
            signedUrl: {
              signature: "mockSignature",
              ttlSeconds: 1.3,
              usableSeconds: getCurrentDate(),
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if the usableSeconds is not a valid type", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.getObject({
            bucketId: "bucket",
            decodedObjectId: "dir%2Fobject",
            signedUrl: {
              signature: "mockSignature",
              ttlSeconds: 1.3,
              usableSeconds: "invalid date",
            },
          })
        ).to.be.rejectedWith(BadRequestError);
      });
    });

    describe("#generateSignedUrl", () => {
      it("should throw an error if TTL is not an integer", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.generateSignedUrl({
            bucketId: "10",
            decodedObjectId: "dir%2Fobject",
            baseUrl: "localhost:9000",
            ttlSeconds: 1.4,
          })
        ).to.be.rejectedWith(BadRequestError);
      });

      it("should throw an error if TTL is below the min or above the max time", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        const times = [SIGNED_URL_MIN_TTL_SECONDS, SIGNED_URL_MAX_TTL_SECONDS];

        times.forEach((time) => {
          expect(
            storageLayer.generateSignedUrl({
              bucketId: "10",
              decodedObjectId: "dir%2Fobject",
              baseUrl: "localhost:9000",
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
            baseUrl: "localhost:9000",
            ttlSeconds: 10,
          })
        ).to.be.rejectedWith(ForbiddenError);
      });

      it("should throw an error if object does not exist", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        expect(
          storageLayer.generateSignedUrl({
            bucketId: "10",
            decodedObjectId: "dir%2Fobject",
            baseUrl: "localhost:9000",
            ttlSeconds: 10,
          })
        ).to.be.rejectedWith(NotFoundError);
      });

      it("should return a valid signed URL", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const regexToReplace = /X-Firebase-Date=([^&]+)/;

        await uploadFile(storageLayer, "bucket", "dir/object", {
          data: "Hello, World!",
          metadata: { contentType: "mime/type" },
        });

        const tempUnsignedUrl = createUnsignedUrl({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
          ttlSeconds: 1,
          usableSeconds: "*",
          url: "localhost:9000",
        });

        const signedUrlObject = await storageLayer.generateSignedUrl({
          bucketId: "bucket",
          decodedObjectId: "dir%2Fobject",
          baseUrl: "localhost:9000",
          ttlSeconds: 1,
        });

        const signedDate = regexToReplace.exec(signedUrlObject.signed_url);

        const unsignedUrl = `${tempUnsignedUrl.replace("X-Firebase-Date=*", signedDate![0])}`;

        const signature = createSignature(unsignedUrl);

        const actualSignedUrl = `${unsignedUrl}&X-Firebase-Signature=${encodeURIComponent(
          signature
        )}`;

        expect(actualSignedUrl).to.equal(signedUrlObject.signed_url);
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

/**
 * get the current date + changeBy SECONDS
 * @date 7/12/2023 - 4:28:20 PM
 *
 * @param {number} changeBy
 * @returns {string}
 */
function getAdjustedDate(changeBy: number): string {
  return getSignedUrlTimestampFor(new Date(new Date().getTime() + changeBy * SECONDS_TO_MS_FACTOR));
}
