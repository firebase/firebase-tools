/*
  it("should store file in memory when upload is finalized", () => {
    const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);
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
    const storageLayer = getStorageLayer(ALWAYS_TRUE_RULES_VALIDATOR);

    const upload = storageLayer.startUpload("bucket", "object", "mime/type", {
      contentType: "mime/type",
    });
    storageLayer.uploadBytes(upload.uploadId, Buffer.alloc(0));
    storageLayer.cancelUpload(upload);

    expect(storageLayer.getMetadata("bucket", "object")).to.equal(undefined);
  });*/
