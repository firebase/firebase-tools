import { Router } from "express";
import { gunzipSync } from "zlib";
import { Emulators } from "../../types";
import {
  CloudStorageObjectAccessControlMetadata,
  CloudStorageObjectMetadata,
  StoredFileMetadata,
} from "../metadata";
import { EmulatorRegistry } from "../../registry";
import { StorageEmulator } from "../index";
import { EmulatorLogger } from "../../emulatorLogger";
import { StorageLayer } from "../files";
import type { Request, Response } from "express";
import { parseObjectUploadMultipartRequest } from "../multipart";
import { Upload, UploadNotActiveError } from "../upload";
import { ForbiddenError, NotFoundError } from "../errors";

/**
 * @param emulator
 * @param storage
 */
export function createCloudEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const gcloudStorageAPI = Router();
  const { storageLayer, uploadService } = emulator;

  // Automatically create a bucket for any route which uses a bucket
  gcloudStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
    storageLayer.createBucket(req.params[0]);
    next();
  });

  gcloudStorageAPI.get("/b", async (req, res) => {
    res.json({
      kind: "storage#buckets",
      items: await storageLayer.listBuckets(),
    });
  });

  gcloudStorageAPI.get(
    ["/b/:bucketId/o/:objectId", "/download/storage/v1/b/:bucketId/o/:objectId"],
    (req, res) => {
      const md = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

      if (!md) {
        res.sendStatus(404);
        return;
      }

      if (req.query.alt === "media") {
        return sendFileBytes(md, storageLayer, req, res);
      }

      const outgoingMd = new CloudStorageObjectMetadata(md);

      res.json(outgoingMd).status(200).send();
      return;
    }
  );

  gcloudStorageAPI.patch("/b/:bucketId/o/:objectId", (req, res) => {
    const md = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

    if (!md) {
      res.sendStatus(404);
      return;
    }

    md.update(req.body);

    const outgoingMetadata = new CloudStorageObjectMetadata(md);
    res.json(outgoingMetadata).status(200).send();
    return;
  });

  gcloudStorageAPI.get("/b/:bucketId/o", (req, res) => {
    // TODO validate that all query params are single strings and are not repeated.
    let maxRes = undefined;
    if (req.query.maxResults) {
      maxRes = +req.query.maxResults.toString();
    }
    const delimiter = req.query.delimiter ? req.query.delimiter.toString() : "/";
    const pageToken = req.query.pageToken ? req.query.pageToken.toString() : undefined;
    const prefix = req.query.prefix ? req.query.prefix.toString() : "";

    const listResult = storageLayer.listItems(
      req.params.bucketId,
      prefix,
      delimiter,
      pageToken,
      maxRes
    );

    res.json(listResult);
  });

  gcloudStorageAPI.delete("/b/:bucketId/o/:objectId", (req, res) => {
    const md = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

    if (!md) {
      res.sendStatus(404);
      return;
    }

    storageLayer.deleteFile(req.params.bucketId, req.params.objectId);
    res.status(200).send();
  });

  const reqBodyToBuffer = async (req: Request): Promise<Buffer> => {
    if (req.body instanceof Buffer) {
      return Buffer.from(req.body);
    }
    const bufs: Buffer[] = [];
    req.on("data", (data) => {
      bufs.push(data);
    });
    await new Promise<void>((resolve) => {
      req.on("end", () => {
        resolve();
      });
    });
    return Buffer.concat(bufs);
  };

  gcloudStorageAPI.put("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
    if (!req.query.upload_id) {
      res.sendStatus(400);
      return;
    }

    const uploadId = req.query.upload_id.toString();
    let upload: Upload;
    try {
      uploadService.continueResumableUpload(uploadId, await reqBodyToBuffer(req));
      upload = uploadService.finalizeResumableUpload(uploadId);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.sendStatus(404);
      } else if (err instanceof UploadNotActiveError) {
        return res.sendStatus(400);
      }
      throw err;
    }

    let metadata: StoredFileMetadata;
    try {
      metadata = await storageLayer.handleUploadObject(upload, /* skipAuth = */ true);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new Error("Request failed unexpectedly due to Firebase Rules.");
      }
      throw err;
    }
    return res.json(new CloudStorageObjectMetadata(metadata));
  });

  gcloudStorageAPI.post("/b/:bucketId/o/:objectId/acl", (req, res) => {
    // TODO(abehaskins) Link to a doc with more info
    EmulatorLogger.forEmulator(Emulators.STORAGE).log(
      "WARN_ONCE",
      "Cloud Storage ACLs are not supported in the Storage Emulator. All related methods will succeed, but have no effect."
    );
    const md = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

    if (!md) {
      res.sendStatus(404);
      return;
    }

    // We do an empty update to step metageneration forward;
    md.update({});

    res
      .json({
        kind: "storage#objectAccessControl",
        object: md.name,
        id: `${req.params.bucketId}/${md.name}/${md.generation}/allUsers`,
        selfLink: `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
          EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
        }/storage/v1/b/${md.bucket}/o/${encodeURIComponent(md.name)}/acl/allUsers`,
        bucket: md.bucket,
        entity: req.body.entity,
        role: req.body.role,
        etag: "someEtag",
        generation: md.generation.toString(),
      } as CloudStorageObjectAccessControlMetadata)
      .status(200);
  });

  gcloudStorageAPI.post("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
    if (!req.query.name) {
      res.sendStatus(400);
      return;
    }
    let name = req.query.name.toString();

    if (name.startsWith("/")) {
      name = name.slice(1);
    }

    const contentTypeHeader = req.header("content-type") || req.header("x-upload-content-type");

    if (!contentTypeHeader) {
      return res.sendStatus(400);
    }
    if (req.query.uploadType === "resumable") {
      const emulatorInfo = EmulatorRegistry.getInfo(Emulators.STORAGE);
      if (emulatorInfo === undefined) {
        return res.sendStatus(500);
      }
      const upload = uploadService.startResumableUpload({
        bucketId: req.params.bucketId,
        objectId: name,
        metadataRaw: JSON.stringify(req.body),
        authorization: req.header("authorization"),
      });

      const { host, port } = emulatorInfo;
      const uploadUrl = `http://${host}:${port}/upload/storage/v1/b/${req.params.bucketId}/o?name=${name}&uploadType=resumable&upload_id=${upload.id}`;
      return res.header("location", uploadUrl).sendStatus(200);
    }

    // Multipart upload
    let metadataRaw: string;
    let dataRaw: Buffer;
    try {
      ({ metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(
        contentTypeHeader!,
        await reqBodyToBuffer(req)
      ));
    } catch (err) {
      return res.status(400).json({
        error: {
          code: 400,
          message: err,
        },
      });
    }

    const upload = uploadService.multipartUpload({
      bucketId: req.params.bucketId,
      objectId: name,
      metadataRaw: metadataRaw,
      dataRaw: dataRaw,
      authorization: req.header("authorization"),
    });
    let metadata: StoredFileMetadata;
    try {
      metadata = await storageLayer.handleUploadObject(upload, /* skipAuth = */ true);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new Error("Request failed unexpectedly due to Firebase Rules.");
      }
      throw err;
    }

    return res.status(200).json(new CloudStorageObjectMetadata(metadata));
  });

  gcloudStorageAPI.get("/:bucketId/:objectId(**)", (req, res) => {
    const md = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

    if (!md) {
      res.sendStatus(404);
      return;
    }

    return sendFileBytes(md, storageLayer, req, res);
  });

  gcloudStorageAPI.all("/**", (req, res) => {
    if (process.env.STORAGE_EMULATOR_DEBUG) {
      console.table(req.headers);
      console.log(req.method, req.url);
      res.json("endpoint not implemented");
    } else {
      res.sendStatus(501);
    }
  });

  return gcloudStorageAPI;
}

function sendFileBytes(
  md: StoredFileMetadata,
  storageLayer: StorageLayer,
  req: Request,
  res: Response
) {
  let data = storageLayer.getBytes(req.params.bucketId, req.params.objectId);
  if (!data) {
    res.sendStatus(404);
    return;
  }

  const isGZipped = md.contentEncoding === "gzip";
  if (isGZipped) {
    data = gunzipSync(data);
  }

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", md.contentType);
  res.setHeader("Content-Disposition", md.contentDisposition);
  res.setHeader("Content-Encoding", "identity");

  const byteRange = [...(req.header("range") || "").split("bytes="), "", ""];

  const [rangeStart, rangeEnd] = byteRange[1].split("-");

  if (rangeStart) {
    const range = {
      start: parseInt(rangeStart),
      end: rangeEnd ? parseInt(rangeEnd) : data.byteLength,
    };
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end - 1}/${data.byteLength}`);
    res.status(206).end(data.slice(range.start, range.end));
  } else {
    res.end(data);
  }
  return;
}
