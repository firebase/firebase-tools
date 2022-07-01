/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
      Buffer.from("Hello, World!")
    );

    const json = StoredFileMetadata.toJSON(metadata);
    const deserialized = StoredFileMetadata.fromJSON(json, cf);
    expect(deserialized).to.deep.equal(metadata);
  });

  describe("StorageLayer", () => {
    let _persistence: Persistence;
    let _uploadService: UploadService;

    beforeEach(() => {
      _persistence = new Persistence(getPersistenceTmpDir());
      _uploadService = new UploadService(_persistence);
    });

    describe("#handleUploadObject()", () => {
      it("should throw if upload is not finished", () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const upload = _uploadService.startResumableUpload({
          bucketId: "bucket",
          objectId: "dir%2Fobject",
          metadataRaw: "{}",
        });

        expect(storageLayer.uploadObject(upload)).to.be.rejectedWith("Unexpected upload status");
      });

      it("should throw if upload is not authorized", () => {
        const storageLayer = getStorageLayer(ALWAYS_FALSE_RULES_VALIDATOR);
        const uploadId = _uploadService.startResumableUpload({
          bucketId: "bucket",
          objectId: "dir%2Fobject",
          metadataRaw: "{}",
        }).id;
        _uploadService.continueResumableUpload(uploadId, Buffer.from("hello world"));
        const upload = _uploadService.finalizeResumableUpload(uploadId);

        expect(storageLayer.uploadObject(upload)).to.be.rejectedWith(ForbiddenError);
      });
    });

    describe("#handleGetObject()", () => {
      it("should return data and metadata", async () => {
        const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
        const upload = _uploadService.multipartUpload({
          bucketId: "bucket",
          objectId: "dir%2Fobject",
          metadataRaw: `{"contentType": "mime/type"}`,
          dataRaw: Buffer.from("Hello, World!"),
        });
        await storageLayer.uploadObject(upload);

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
