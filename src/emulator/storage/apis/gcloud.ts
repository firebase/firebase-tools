import { Router } from "express";
import { Emulators } from "../../types";
import {
  CloudStorageObjectAccessControlMetadata,
  CloudStorageObjectMetadata,
  IncomingMetadata,
  StoredFileMetadata,
} from "../metadata";
import { sendFileBytes } from "./shared";
import { EmulatorRegistry } from "../../registry";
import { StorageEmulator } from "../index";
import { EmulatorLogger } from "../../emulatorLogger";
import { GetObjectResponse, ListObjectsResponse } from "../files";
import type { Request, Response } from "express";
import { parseObjectUploadMultipartRequest } from "../multipart";
import { NotCancellableError, Upload, UploadNotActiveError, UploadStatus } from "../upload";
import { ForbiddenError, NotFoundError } from "../errors";
import { reqBodyToBuffer } from "../../shared/request";
import type { Query } from "express-serve-static-core";

export function createCloudEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const gcloudStorageAPI = Router();
  // Use Admin StorageLayer to ensure Firebase Rules validation is skipped.
  const { adminStorageLayer, uploadService } = emulator;

  // Debug statements
  if (process.env.STORAGE_EMULATOR_DEBUG) {
    gcloudStorageAPI.use((req, res, next) => {
      console.log("--------------INCOMING GCS REQUEST--------------");
      console.log(`${req.method.toUpperCase()} ${req.path}`);
      console.log("-- query:");
      console.log(JSON.stringify(req.query, undefined, 2));
      console.log("-- headers:");
      console.log(JSON.stringify(req.headers, undefined, 2));
      console.log("-- body:");

      if (req.body instanceof Buffer) {
        console.log(`Buffer of ${req.body.length}`);
      } else if (req.body) {
        console.log(req.body);
      } else {
        console.log("Empty body (could be stream)");
      }

      const resJson = res.json.bind(res);
      res.json = (...args: any[]) => {
        console.log("-- response:");
        args.forEach((data) => console.log(JSON.stringify(data, undefined, 2)));

        return resJson.call(res, ...args);
      };

      const resSendStatus = res.sendStatus.bind(res);
      res.sendStatus = (status) => {
        console.log("-- response status:");
        console.log(status);

        return resSendStatus.call(res, status);
      };

      const resStatus = res.status.bind(res);
      res.status = (status) => {
        console.log("-- response status:");
        console.log(status);

        return resStatus.call(res, status);
      };

      next();
    });
  }

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
    [
      "/b/:bucketId/o/:objectId",
      "/download/storage/v1/b/:bucketId/o/:objectId",
      "/storage/v1/b/:bucketId/o/:objectId",
    ],
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
    },
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

  gcloudStorageAPI.get(["/b/:bucketId/o", "/storage/v1/b/:bucketId/o"], async (req, res) => {
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
      kind: "storage#objects",
      nextPageToken: listResponse.nextPageToken,
      prefixes: listResponse.prefixes,
      items: listResponse.items?.map((item) => new CloudStorageObjectMetadata(item)),
    });
  });

  gcloudStorageAPI.delete(
    ["/b/:bucketId/o/:objectId", "/storage/v1/b/:bucketId/o/:objectId"],
    async (req, res) => {
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
    },
  );

  gcloudStorageAPI.put("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
    if (!req.query.upload_id) {
      return res.sendStatus(404);
    }

    async function handleStatusCheck(upload: Upload, contentRange: string) {
      // Extract the numeric total from bytes */total or bytes start-end/total forms.
      const totalMatch = contentRange && /\/(\d+)$/.exec(contentRange);
      const declaredTotal = totalMatch ? parseInt(totalMatch[1], 10) : undefined;

      if (upload.status === UploadStatus.FINISHED) {
        let getObjectResponse: GetObjectResponse;
        try {
          getObjectResponse = await adminStorageLayer.getObject({
            bucketId: upload.bucketId,
            decodedObjectId: upload.objectId,
          });
        } catch (err) {
          if (err instanceof NotFoundError) {
            return res.sendStatus(404);
          }
          if (err instanceof ForbiddenError) {
            return res.sendStatus(403);
          }
          throw err;
        }
        return res.status(200).json(new CloudStorageObjectMetadata(getObjectResponse.metadata));
      }

      if (upload.status !== UploadStatus.ACTIVE) {
        return res.sendStatus(400);
      }

      // if the declared total matches the bytes received so far, the client is signalling that
      // the upload is complete (i.e. streaming upload where total size wasn't known upfront).
      if (declaredTotal !== undefined && upload.size === declaredTotal) {
        const metadata = await finalizeUpload(uploadId);
        return res.status(200).json(new CloudStorageObjectMetadata(metadata));
      }

      if (upload.size === 0) {
        return res.status(308).send();
      }

      res.setHeader("Range", `bytes=0-${upload.size - 1}/${declaredTotal ?? "*"}`);
      return res.status(308).send();
    }

    async function handleChunkedUpload(upload: Upload, contentRange: string, data: Buffer) {
      const rangeMatch = /^bytes (\d+)-(\d+)(?:\/(\d+|\*))?$/.exec(contentRange);
      if (!rangeMatch) {
        return res.status(400).send("Failed to parse Content-Range header.");
      }

      const rangeStart = parseInt(rangeMatch[1], 10);
      const rangeEnd = parseInt(rangeMatch[2], 10);
      const rangeTotal =
        rangeMatch[3] && rangeMatch[3] !== "*" ? parseInt(rangeMatch[3], 10) : undefined;

      if (rangeEnd < rangeStart || (rangeTotal !== undefined && rangeTotal < rangeEnd + 1)) {
        return res.status(400).send("Failed to parse Content-Range header.");
      }

      if (rangeStart !== upload.size) {
        return res
          .status(400)
          .send(`Invalid chunk position. The next chunk should start at offset ${upload.size}.`);
      }

      const expectedChunkSize = rangeEnd - rangeStart + 1;

      if (data.byteLength !== expectedChunkSize) {
        const message = `Invalid request.  There were ${data.byteLength} byte(s) in the request body.  There should have been ${expectedChunkSize} byte(s) (starting at offset ${rangeStart} and ending at offset ${rangeEnd}) according to the Content-Range header.`;
        return res.status(400).send(message);
      }

      const updatedUpload = uploadService.continueResumableUpload(uploadId, data);

      /**
       * When the client uses an unknown total (`*` or omitted), we treat a chunk whose
       * size is not a multiple of 256 KiB as the final chunk. Objects whose size is
       * an exact multiple of 256 KiB must end with an explicit total in Content-Range.
       * @see https://docs.cloud.google.com/storage/docs/performing-resumable-uploads#chunked-upload
       */
      const isComplete =
        typeof rangeTotal === "number"
          ? updatedUpload.size >= rangeTotal
          : data.byteLength % (256 * 1024) !== 0;

      if (isComplete) {
        const metadata = await finalizeUpload(uploadId);
        return res.status(200).json(new CloudStorageObjectMetadata(metadata));
      }

      res.setHeader("Range", `bytes=0-${updatedUpload.size - 1}/${rangeTotal ?? "*"}`);
      return res.status(308).send();
    }

    async function finalizeUpload(uploadId: string) {
      const finalizedUpload = uploadService.finalizeResumableUpload(uploadId);
      return await adminStorageLayer.uploadObject(finalizedUpload);
    }

    const uploadId = req.query.upload_id.toString();
    let upload: Upload;
    try {
      upload = uploadService.getResumableUpload(uploadId);

      if (upload.status === UploadStatus.CANCELLED) {
        return res.sendStatus(499);
      }

      const contentLength = req.headers["content-length"];
      const contentRange = req.headers["content-range"] ?? "";

      // Status check request
      // @see https://docs.cloud.google.com/storage/docs/performing-resumable-uploads#status-check
      if (contentLength === "0") {
        return await handleStatusCheck(upload, contentRange);
      }

      if (contentLength && contentLength !== "0") {
        const data = await reqBodyToBuffer(req);

        // Multiple chunk upload
        if (contentRange) {
          return await handleChunkedUpload(upload, contentRange, data);
        } else {
          // Single chunk upload
          uploadService.continueResumableUpload(uploadId, data);
          const metadata = await finalizeUpload(uploadId);
          return res.status(200).json(new CloudStorageObjectMetadata(metadata));
        }
      }
      return res.status(400).send();
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.sendStatus(404);
      } else if (err instanceof ForbiddenError) {
        return res.sendStatus(403);
      } else if (err instanceof UploadNotActiveError) {
        return res.sendStatus(400);
      }
      throw err;
    }
  });

  gcloudStorageAPI.delete("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
    if (!req.query.upload_id) {
      return res.sendStatus(405);
    }

    const uploadId = req.query.upload_id.toString();

    try {
      uploadService.cancelResumableUpload(uploadId);
      return res.sendStatus(499);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.sendStatus(404);
      } else if (err instanceof NotCancellableError) {
        return res.sendStatus(405);
      }
      throw err;
    }
  });

  gcloudStorageAPI.post("/b/:bucketId/o/:objectId/acl", async (req, res) => {
    // TODO(abehaskins) Link to a doc with more info
    EmulatorLogger.forEmulator(Emulators.STORAGE).log(
      "WARN_ONCE",
      "Cloud Storage ACLs are not supported in the Storage Emulator. All related methods will succeed, but have no effect.",
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
    const selfLink = EmulatorRegistry.url(Emulators.STORAGE);
    selfLink.pathname = `/storage/v1/b/${metadata.bucket}/o/${encodeURIComponent(
      metadata.name,
    )}/acl/allUsers`;
    return res.json({
      kind: "storage#objectAccessControl",
      object: metadata.name,
      id: `${req.params.bucketId}/${metadata.name}/${metadata.generation}/allUsers`,
      selfLink: selfLink.toString(),
      bucket: metadata.bucket,
      entity: req.body.entity,
      role: req.body.role,
      etag: "someEtag",
      generation: metadata.generation.toString(),
    } as CloudStorageObjectAccessControlMetadata);
  });

  gcloudStorageAPI.post("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
    const uploadType = req.query.uploadType || req.header("X-Goog-Upload-Protocol");

    // Resumable upload protocol.
    if (uploadType === "resumable") {
      const name = getIncomingFileNameFromRequest(req.query, req.body);
      if (name === undefined) {
        res.sendStatus(400);
        return;
      }
      const contentType = req.header("x-upload-content-type");
      const upload = uploadService.startResumableUpload({
        bucketId: req.params.bucketId,
        objectId: name,
        metadata: { contentType, ...req.body },
        authorization: req.header("authorization"),
      });

      const uploadUrl = EmulatorRegistry.url(Emulators.STORAGE, req);
      uploadUrl.pathname = `/upload/storage/v1/b/${req.params.bucketId}/o`;
      uploadUrl.searchParams.set("name", name);
      uploadUrl.searchParams.set("uploadType", "resumable");
      uploadUrl.searchParams.set("upload_id", upload.id);
      return res.header("location", uploadUrl.toString()).sendStatus(200);
    }

    async function finalizeOneShotUpload(upload: Upload) {
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
    }

    // Multipart upload protocol.
    if (uploadType === "multipart") {
      const contentTypeHeader = req.header("content-type") || req.header("x-upload-content-type");
      const contentType = req.header("x-upload-content-type");
      if (!contentTypeHeader) {
        return res.sendStatus(400);
      }
      let metadataRaw: string;
      let dataRaw: Buffer;
      try {
        ({ metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(
          contentTypeHeader,
          await reqBodyToBuffer(req),
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

      const name = getIncomingFileNameFromRequest(req.query, JSON.parse(metadataRaw));
      if (name === undefined) {
        res.sendStatus(400);
        return;
      }
      const upload = uploadService.multipartUpload({
        bucketId: req.params.bucketId,
        objectId: name,
        metadata: { contentType, ...JSON.parse(metadataRaw) },
        dataRaw: dataRaw,
        authorization: req.header("authorization"),
      });
      return await finalizeOneShotUpload(upload);
    }

    // Default to media (data-only) upload protocol.
    const name = req.query.name;
    if (!name) {
      res.sendStatus(400);
    }

    const upload = uploadService.mediaUpload({
      bucketId: req.params.bucketId,
      objectId: name!.toString(),
      dataRaw: await reqBodyToBuffer(req),
      authorization: req.header("authorization"),
    });
    return await finalizeOneShotUpload(upload);
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
    },
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

function getIncomingFileNameFromRequest(
  query: Query,
  metadata: IncomingMetadata,
): string | undefined {
  const name = query?.name?.toString() || metadata?.name;
  return name?.startsWith("/") ? name.slice(1) : name;
}
