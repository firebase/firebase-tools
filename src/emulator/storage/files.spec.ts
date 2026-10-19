import { expect } from "chai";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import { StoredFileMetadata } from "./metadata";
import { StorageCloudFunctions } from "./cloudFunctions";
import { StorageLayer } from "./files";
import { ForbiddenError, NotFoundError } from "./errors";
import { Persistence } from "./persistence";
import { FirebaseRulesValidator } from "./rules/utils";
import { UploadService } from "./upload";
import { FakeEmulator } from "../testing/fakeEmulator";
import { Emulators } from "../types";
import { EmulatorRegistry } from "../registry";

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
  // The storage emulator uses EmulatorRegistry to generate links in metadata.
  before(async () => {
    const emu = await FakeEmulator.create(Emulators.STORAGE);
    await EmulatorRegistry.start(emu);
  });
  after(async () => {
    await EmulatorRegistry.stop(Emulators.STORAGE);
  });

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
      metadata?: Record<string, unknown>;
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

    describe("object names with dot segments", () => {
      // Cloud Storage object names are literal, so "a/../b" and "b" are two different objects.
      // These upload with the decoded name, the way the Firebase API handler passes it on.
      async function uploadDecoded(
        storageLayer: StorageLayer,
        bucketId: string,
        objectId: string,
        data: string,
      ) {
        const upload = _uploadService.multipartUpload({
          bucketId,
          objectId,
          dataRaw: Buffer.from(data),
          metadata: {},
        });
        await storageLayer.uploadObject(upload);
      }

      async function readData(storageLayer: StorageLayer, objectId: string) {
        const { data } = await storageLayer.getObject({
          bucketId: "bucket",
          decodedObjectId: objectId,
        });
        return data.toString();
      }

      it("should not overwrite another object on upload", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        await uploadDecoded(storageLayer, "bucket", "users/B/photo.png", "from B");

        await uploadDecoded(storageLayer, "bucket", "users/A/../B/photo.png", "from A");

        expect(await readData(storageLayer, "users/B/photo.png")).to.equal("from B");
        expect(await readData(storageLayer, "users/A/../B/photo.png")).to.equal("from A");
      });

      it("should not find another object on read", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        await uploadDecoded(storageLayer, "bucket", "users/B/photo.png", "from B");

        await expect(
          storageLayer.getObject({ bucketId: "bucket", decodedObjectId: "users/A/../B/photo.png" }),
        ).to.be.rejectedWith(NotFoundError);
        await expect(
          storageLayer.getObject({ bucketId: "bucket", decodedObjectId: "users/B/./photo.png" }),
        ).to.be.rejectedWith(NotFoundError);
      });

      it("should not delete another object", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        await uploadDecoded(storageLayer, "bucket", "users/B/photo.png", "from B");

        await expect(
          storageLayer.deleteObject({
            bucketId: "bucket",
            decodedObjectId: "users/A/../B/photo.png",
          }),
        ).to.be.rejectedWith(NotFoundError);
        expect(await readData(storageLayer, "users/B/photo.png")).to.equal("from B");
      });

      it("should not copy over another object", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        await uploadDecoded(storageLayer, "bucket", "users/B/photo.png", "from B");
        await uploadDecoded(storageLayer, "bucket", "users/A/source.png", "from A");

        storageLayer.copyObject({
          sourceBucket: "bucket",
          sourceObject: "users/A/source.png",
          destinationBucket: "bucket",
          destinationObject: "users/A/../B/photo.png",
        });

        expect(await readData(storageLayer, "users/B/photo.png")).to.equal("from B");
        expect(await readData(storageLayer, "users/A/../B/photo.png")).to.equal("from A");
      });

      it("should keep the objects apart through export and import", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        await uploadDecoded(storageLayer, "bucket", "users/B/photo.png", "from B");
        await uploadDecoded(storageLayer, "bucket", "users/A/../B/photo.png", "from A");
        const exportDir = mkdtempSync(path.join(tmpdir(), "storage-export-"));
        await storageLayer.export(exportDir, { initiatedBy: "test" });

        const imported = new StorageLayer(
          "project",
          new Map(),
          new Map(),
          ALWAYS_TRUE_RULES_VALIDATOR,
          ALWAYS_TRUE_ADMIN_CREDENTIAL_VALIDATOR,
          new Persistence(mkdtempSync(path.join(tmpdir(), "storage-import-"))),
          new StorageCloudFunctions("project"),
        );
        imported.import(exportDir, { initiatedBy: "test" });

        expect(await readData(imported, "users/B/photo.png")).to.equal("from B");
        expect(await readData(imported, "users/A/../B/photo.png")).to.equal("from A");
      });
    });

    describe("#import()", () => {
      it("should import object names exported on Windows with backslash separators", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

        storageLayer.import(
          path.join(
            __dirname,
            "../../../scripts/storage-emulator-integration/import/windows-emulator-data/storage_export",
          ),
          { initiatedBy: "test" },
        );

        const { metadata } = await storageLayer.getObject({
          bucketId: "fake-project-id.appspot.com",
          decodedObjectId: "test-directory/test_nested_upload.jpg",
        });
        expect(metadata.bucket).to.equal("fake-project-id.appspot.com");
        await storageLayer.getObject({
          bucketId: "fake-project-id.appspot.com",
          decodedObjectId: "test_upload.jpg",
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
        new StorageCloudFunctions("project"),
      );

    const getPersistenceTmpDir = () => `${tmpdir()}/firebase/storage/blobs`;
  });
}).timeout(2000);
