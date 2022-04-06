import { Router } from "express";
import { gunzipSync } from "zlib";
import { Emulators } from "../../types";
import {
  CloudStorageObjectAccessControlMetadata,
  CloudStorageObjectMetadata,
  IncomingMetadata,
  StoredFileMetadata,
} from "../metadata";
import { EmulatorRegistry } from "../../registry";
import { StorageEmulator } from "../index";
import { EmulatorLogger } from "../../emulatorLogger";
import { GetObjectResponse, ListObjectsResponse } from "../files";
import { crc32cToString } from "../crc";
import type { Request, Response } from "express";
import { parseObjectUploadMultipartRequest } from "../multipart";
import { Upload, UploadNotActiveError } from "../upload";
import { ForbiddenError, NotFoundError } from "../errors";
import { reqBodyToBuffer } from "../../shared/request";

export function createCloudEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const gcloudStorageAPI = Router();
  // Use Admin StorageLayer to ensure Firebase Rules validation is skipped.
  const { adminStorageLayer, uploadService } = emulator;

  // Automatically create a bucket for any route which uses a bucket
  gcloudStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
    adminStorageLayer.createBucket(req.params[0]);
    next();
  });

  gcloudStorageAPI.get("/b", async (req, res) => {
    res.json({
      kind: "storage#buckets",
      items: await adminStorageLayer.listBuckets(),
    });
  });

  gcloudStorageAPI.get(
    ["/b/:bucketId/o/:objectId", "/download/storage/v1/b/:bucketId/o/:objectId"],
    async (req, res) => {
      let getObjectResponse: GetObjectResponse;
      try {
        getObjectResponse = await adminStorageLayer.getObject({
          bucketId: req.params.bucketId,
          decodedObjectId: req.params.objectId,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return sendObjectNotFound(req, res);
        }
        if (err instanceof ForbiddenError) {
          return res.sendStatus(403);
        }
        throw err;
      }

      if (req.query.alt === "media") {
        return sendFileBytes(getObjectResponse.metadata, getObjectResponse.data, req, res);
      }
      return res.json(new CloudStorageObjectMetadata(getObjectResponse.metadata));
    }
  );

  gcloudStorageAPI.patch("/b/:bucketId/o/:objectId", async (req, res) => {
    let updatedMetadata: StoredFileMetadata;
    try {
      updatedMetadata = await adminStorageLayer.updateObjectMetadata({
        bucketId: req.params.bucketId,
        decodedObjectId: req.params.objectId,
        metadata: req.body as IncomingMetadata,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return sendObjectNotFound(req, res);
      }
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }
    return res.json(new CloudStorageObjectMetadata(updatedMetadata));
  });

  gcloudStorageAPI.get("/b/:bucketId/o", async (req, res) => {
    let listResponse: ListObjectsResponse;
    // TODO validate that all query params are single strings and are not repeated.
    try {
      listResponse = await adminStorageLayer.listObjects({
        bucketId: req.params.bucketId,
        prefix: req.query.prefix ? req.query.prefix.toString() : "",
        delimiter: req.query.delimiter ? req.query.delimiter.toString() : "",
        pageToken: req.query.pageToken ? req.query.pageToken.toString() : undefined,
        maxResults: req.query.maxResults ? +req.query.maxResults.toString() : undefined,
        authorization: req.header("authorization"),
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }
    return res.status(200).json({
      kind: "#storage/objects",
      nextPageToken: listResponse.nextPageToken,
      prefixes: listResponse.prefixes,
      items: listResponse.items?.map((item) => new CloudStorageObjectMetadata(item)),
    });
  });

  gcloudStorageAPI.delete("/b/:bucketId/o/:objectId", async (req, res) => {
    try {
      await adminStorageLayer.deleteObject({
        bucketId: req.params.bucketId,
        decodedObjectId: req.params.objectId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return sendObjectNotFound(req, res);
      }
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }
    return res.sendStatus(204);
  });

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
      metadata = await adminStorageLayer.uploadObject(upload);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }
    return res.json(new CloudStorageObjectMetadata(metadata));
  });

  gcloudStorageAPI.post("/b/:bucketId/o/:objectId/acl", async (req, res) => {
    // TODO(abehaskins) Link to a doc with more info
    EmulatorLogger.forEmulator(Emulators.STORAGE).log(
      "WARN_ONCE",
      "Cloud Storage ACLs are not supported in the Storage Emulator. All related methods will succeed, but have no effect."
    );
    let getObjectResponse: GetObjectResponse;
    try {
      getObjectResponse = await adminStorageLayer.getObject({
        bucketId: req.params.bucketId,
        decodedObjectId: req.params.objectId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return sendObjectNotFound(req, res);
      }
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }
    const { metadata } = getObjectResponse;
    // We do an empty update to step metageneration forward;
    metadata.update({});
    return res.json({
      kind: "storage#objectAccessControl",
      object: metadata.name,
      id: `${req.params.bucketId}/${metadata.name}/${metadata.generation}/allUsers`,
      selfLink: `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
        EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
      }/storage/v1/b/${metadata.bucket}/o/${encodeURIComponent(metadata.name)}/acl/allUsers`,
      bucket: metadata.bucket,
      entity: req.body.entity,
      role: req.body.role,
      etag: "someEtag",
      generation: metadata.generation.toString(),
    } as CloudStorageObjectAccessControlMetadata);
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

      const uploadUrl = EmulatorRegistry.url(Emulators.STORAGE, req);
      uploadUrl.pathname = `/upload/storage/v1/b/${req.params.bucketId}/o`;
      uploadUrl.searchParams.set("name", name);
      uploadUrl.searchParams.set("uploadType", "resumable");
      uploadUrl.searchParams.set("upload_id", upload.id);
      return res.header("location", uploadUrl.toString()).sendStatus(200);
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
      if (err instanceof Error) {
        return res.status(400).json({
          error: {
            code: 400,
            message: err.message,
          },
        });
      }
      throw err;
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
      metadata = await adminStorageLayer.uploadObject(upload);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }

    return res.status(200).json(new CloudStorageObjectMetadata(metadata));
  });

  gcloudStorageAPI.get("/:bucketId/:objectId(**)", async (req, res) => {
    let getObjectResponse: GetObjectResponse;
    try {
      getObjectResponse = await adminStorageLayer.getObject({
        bucketId: req.params.bucketId,
        decodedObjectId: req.params.objectId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return sendObjectNotFound(req, res);
      }
      if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      }
      throw err;
    }
    return sendFileBytes(getObjectResponse.metadata, getObjectResponse.data, req, res);
  });

  gcloudStorageAPI.post(
    "/b/:bucketId/o/:objectId/:method(rewriteTo|copyTo)/b/:destBucketId/o/:destObjectId",
    (req, res, next) => {
      if (req.params.method === "rewriteTo" && req.query.rewriteToken) {
        // Don't yet support multi-request copying
        return next();
      }
      let metadata: StoredFileMetadata;
      try {
        metadata = adminStorageLayer.copyObject({
          sourceBucket: req.params.bucketId,
          sourceObject: req.params.objectId,
          destinationBucket: req.params.destBucketId,
          destinationObject: req.params.destObjectId,
          incomingMetadata: req.body,
          // TODO(tonyjhuang): Until we have a way of validating OAuth tokens passed by
          // the GCS sdk or gcloud tool, we must assume all requests have valid admin creds.
          // authorization: req.header("authorization")
          authorization: "Bearer owner",
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return sendObjectNotFound(req, res);
        }
        if (err instanceof ForbiddenError) {
          return res.sendStatus(403);
        }
        throw err;
      }

      const resource = new CloudStorageObjectMetadata(metadata);

      res.status(200);
      if (req.params.method === "copyTo") {
        // See https://cloud.google.com/storage/docs/json_api/v1/objects/copy#response
        return res.json(resource);
      } else if (req.params.method === "rewriteTo") {
        // See https://cloud.google.com/storage/docs/json_api/v1/objects/rewrite#response
        return res.json({
          kind: "storage#rewriteResponse",
          totalBytesRewritten: String(metadata.size),
          objectSize: String(metadata.size),
          done: true,
          resource,
        });
      } else {
        return next();
      }
    }
  );

  gcloudStorageAPI.all("/**", (req, res) => {
    if (process.env.STORAGE_EMULATOR_DEBUG) {
      console.table(req.headers);
      console.log(req.method, req.url);
      res.status(501).json("endpoint not implemented");
    } else {
      res.sendStatus(501);
    }
  });

  return gcloudStorageAPI;
}

function sendFileBytes(md: StoredFileMetadata, data: Buffer, req: Request, res: Response): void {
  const isGZipped = md.contentEncoding === "gzip";
  if (isGZipped) {
    data = gunzipSync(data);
  }

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", md.contentType);
  res.setHeader("Content-Disposition", md.contentDisposition);
  res.setHeader("Content-Encoding", md.contentEncoding);
  res.setHeader("ETag", md.etag);
  res.setHeader("Cache-Control", md.cacheControl);
  res.setHeader("x-goog-generation", `${md.generation}`);
  res.setHeader("x-goog-metadatageneration", `${md.metageneration}`);
  res.setHeader("x-goog-storage-class", md.storageClass);
  res.setHeader("x-goog-hash", `crc32c=${crc32cToString(md.crc32c)},md5=${md.md5Hash}`);

  const byteRange = req.range(data.byteLength, { combine: true });

  if (Array.isArray(byteRange) && byteRange.type === "bytes" && byteRange.length > 0) {
    const range = byteRange[0];
    res.setHeader(
      "Content-Range",
      `${byteRange.type} ${range.start}-${range.end}/${data.byteLength}`
    );
    // Byte range requests are inclusive for start and end
    res.status(206).end(data.slice(range.start, range.end + 1));
  } else {
    res.end(data);
  }
}

/** Sends 404 matching API */
function sendObjectNotFound(req: Request, res: Response): void {
  res.status(404);
  const message = `No such object: ${req.params.bucketId}/${req.params.objectId}`;
  if (req.method === "GET" && req.query.alt === "media") {
    res.send(message);
  } else {
    res.json({
      error: {
        code: 404,
        message,
        errors: [
          {
            message,
            domain: "global",
            reason: "notFound",
          },
        ],
      },
    });
  }
}
