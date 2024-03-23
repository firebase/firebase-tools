import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import * as uuid from "uuid";
import { IncomingMetadata, OutgoingFirebaseMetadata, StoredFileMetadata } from "../metadata";
import { Request, Response, Router } from "express";
import { StorageEmulator } from "../index";
import { sendFileBytes } from "./shared";
import { EmulatorRegistry } from "../../registry";
import { parseObjectUploadMultipartRequest } from "../multipart";
import { NotFoundError, ForbiddenError } from "../errors";
import {
  NotCancellableError,
  Upload,
  UploadNotActiveError,
  UploadPreviouslyFinalizedError,
} from "../upload";
import { reqBodyToBuffer } from "../../shared/request";
import { ListObjectsResponse } from "../files";

/**
 * @param emulator
 */
export function createFirebaseEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const firebaseStorageAPI = Router();
  const { storageLayer, uploadService } = emulator;

  if (process.env.STORAGE_EMULATOR_DEBUG) {
    firebaseStorageAPI.use((req, res, next) => {
      console.log("--------------INCOMING FIREBASE REQUEST--------------");
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
  firebaseStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
    const bucketId = req.params[0];
    storageLayer.createBucket(bucketId);
    if (!emulator.rulesManager.getRuleset(bucketId)) {
      EmulatorLogger.forEmulator(Emulators.STORAGE).log(
        "WARN",
        "Permission denied because no Storage ruleset is currently loaded, check your rules for syntax errors.",
      );
      return res.status(403).json({
        error: {
          code: 403,
          message: "Permission denied. Storage Emulator has no loaded ruleset.",
        },
      });
    }
    next();
  });

  firebaseStorageAPI.get("/b/:bucketId/o/:objectId", async (req, res) => {
    let metadata: StoredFileMetadata;
    let data: Buffer;
    try {
      // Both object data and metadata get can use the same handler since they share auth logic.
      ({ metadata, data } = await storageLayer.getObject({
        bucketId: req.params.bucketId,
        decodedObjectId: decodeURIComponent(req.params.objectId),
        authorization: req.header("authorization"),
        downloadToken: req.query.token?.toString(),
      }));
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.sendStatus(404);
      } else if (err instanceof ForbiddenError) {
        return res.status(403).json({
          error: {
            code: 403,
            message: `Permission denied. No READ permission.`,
          },
        });
      }
      throw err;
    }

    if (metadata.downloadTokens.length === 0) {
      metadata.addDownloadToken(/* shouldTrigger = */ true);
    }

    // Object data request
    if (req.query.alt === "media") {
      return sendFileBytes(metadata, data, req, res);
    }

    // Object metadata request
    return res.json(new OutgoingFirebaseMetadata(metadata));
  });

  // list object handler
  firebaseStorageAPI.get("/b/:bucketId/o", async (req, res) => {
    const maxResults = req.query.maxResults?.toString();
    let listResponse: ListObjectsResponse;
    // The prefix query param must be empty or end in a "/"
    let prefix = "";
    if (req.query.prefix) {
      prefix = req.query.prefix.toString();
      if (prefix.charAt(prefix.length - 1) !== "/") {
        return res.status(400).json({
          error: {
            code: 400,
            message:
              "The prefix parameter is required to be empty or ends with a single / character.",
          },
        });
      }
    }
    try {
      listResponse = await storageLayer.listObjects({
        bucketId: req.params.bucketId,
        prefix: prefix,
        delimiter: req.query.delimiter ? req.query.delimiter.toString() : "",
        pageToken: req.query.pageToken?.toString(),
        maxResults: maxResults ? +maxResults : undefined,
        authorization: req.header("authorization"),
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return res.status(403).json({
          error: {
            code: 403,
            message: `Permission denied. No LIST permission.`,
          },
        });
      }
      throw err;
    }
    return res.status(200).json({
      nextPageToken: listResponse.nextPageToken,
      prefixes: (listResponse.prefixes ?? []).filter(isValidPrefix),
      items: (listResponse.items ?? [])
        .filter((item) => isValidNonEncodedPathString(item.name))
        .map((item) => {
          return { name: item.name, bucket: item.bucket };
        }),
    });
  });

  const handleUpload = async (req: Request, res: Response) => {
    const bucketId = req.params.bucketId;
    const objectId: string | null = req.params.objectId
      ? decodeURIComponent(req.params.objectId)
      : req.query.name?.toString() || null;
    const uploadType = req.header("x-goog-upload-protocol")?.toString();

    async function finalizeOneShotUpload(upload: Upload) {
      // Set default download token if it isn't available.
      if (!upload.metadata?.metadata?.firebaseStorageDownloadTokens) {
        const customMetadata = {
          ...(upload.metadata?.metadata || {}),
          firebaseStorageDownloadTokens: uuid.v4(),
        };
        upload.metadata = { ...(upload.metadata || {}), metadata: customMetadata };
      }
      let metadata: StoredFileMetadata;
      try {
        metadata = await storageLayer.uploadObject(upload);
      } catch (err) {
        if (err instanceof ForbiddenError) {
          res.header("x-goog-upload-status", "final");
          uploadService.setResponseCode(upload.id, 403);
          return res.status(403).json({
            error: {
              code: 403,
              message: "Permission denied. No WRITE permission.",
            },
          });
        }
        throw err;
      }
      if (!metadata.contentDisposition) {
        metadata.contentDisposition = "inline";
      }
      return res.status(200).json(new OutgoingFirebaseMetadata(metadata));
    }

    // Resumable upload
    // sdk can set uploadType or just set upload command to indicate resumable upload
    if (uploadType === "resumable" || req.header("x-goog-upload-command")) {
      const uploadCommand = req.header("x-goog-upload-command");
      if (!uploadCommand) {
        res.sendStatus(400);
        return;
      }

      if (uploadCommand === "start") {
        if (!objectId) {
          res.sendStatus(400);
          return;
        }
        const upload = uploadService.startResumableUpload({
          bucketId,
          objectId,
          metadata: req.body,
          // Store auth header for use in the finalize request
          authorization: req.header("authorization"),
        });

        res.header("x-goog-upload-chunk-granularity", "10000");
        res.header("x-goog-upload-control-url", "");
        res.header("x-goog-upload-status", "active");
        res.header("x-gupload-uploadid", upload.id);

        const uploadUrl = EmulatorRegistry.url(Emulators.STORAGE, req);
        uploadUrl.pathname = `/v0/b/${bucketId}/o`;
        uploadUrl.searchParams.set("name", objectId);
        uploadUrl.searchParams.set("upload_id", upload.id);
        uploadUrl.searchParams.set("upload_protocol", "resumable");
        res.header("x-goog-upload-url", uploadUrl.toString());
        return res.sendStatus(200);
      }

      if (!req.query.upload_id) {
        return res.sendStatus(400);
      }

      const uploadId = req.query.upload_id.toString();
      if (uploadCommand === "query") {
        let upload: Upload;
        try {
          upload = uploadService.getResumableUpload(uploadId);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return res.sendStatus(404);
          }
          throw err;
        }
        res.header("X-Goog-Upload-Size-Received", upload.size.toString());
        res.header("x-goog-upload-status", upload.status);
        return res.sendStatus(200);
      }

      if (uploadCommand === "cancel") {
        try {
          uploadService.cancelResumableUpload(uploadId);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return res.sendStatus(404);
          } else if (err instanceof NotCancellableError) {
            return res.sendStatus(400);
          }
          throw err;
        }
        return res.sendStatus(200);
      }

      if (uploadCommand.includes("upload")) {
        let upload: Upload;
        try {
          upload = uploadService.continueResumableUpload(uploadId, await reqBodyToBuffer(req));
        } catch (err) {
          if (err instanceof NotFoundError) {
            return res.sendStatus(404);
          } else if (err instanceof UploadNotActiveError) {
            return res.sendStatus(400);
          }
          throw err;
        }
        if (!uploadCommand.includes("finalize")) {
          res.header("x-goog-upload-status", "active");
          res.header("x-gupload-uploadid", upload.id);
          return res.sendStatus(200);
        }
        // Intentional fall through to handle "upload, finalize" case.
      }

      if (uploadCommand.includes("finalize")) {
        let upload: Upload;
        try {
          upload = uploadService.finalizeResumableUpload(uploadId);
        } catch (err) {
          if (err instanceof NotFoundError) {
            uploadService.setResponseCode(uploadId, 404);
            return res.sendStatus(404);
          } else if (err instanceof UploadNotActiveError) {
            uploadService.setResponseCode(uploadId, 400);
            return res.sendStatus(400);
          } else if (err instanceof UploadPreviouslyFinalizedError) {
            res.header("x-goog-upload-status", "final");
            return res.sendStatus(uploadService.getPreviousResponseCode(uploadId));
          }
          throw err;
        }
        res.header("x-goog-upload-status", "final");
        return await finalizeOneShotUpload(upload);
      }
    }

    if (!objectId) {
      res.sendStatus(400);
      return;
    }

    // Multipart upload
    if (uploadType === "multipart") {
      const contentTypeHeader = req.header("content-type");
      if (!contentTypeHeader) {
        return res.sendStatus(400);
      }

      let metadataRaw: string;
      let dataRaw: Buffer;
      try {
        ({ metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(
          contentTypeHeader!,
          await reqBodyToBuffer(req),
        ));
      } catch (err) {
        if (err instanceof Error) {
          // Matches server error text formatting.
          return res.status(400).send(err.message);
        }
        throw err;
      }
      const upload = uploadService.multipartUpload({
        bucketId,
        objectId,
        metadata: JSON.parse(metadataRaw),
        dataRaw: dataRaw,
        authorization: req.header("authorization"),
      });
      return await finalizeOneShotUpload(upload);
    }

    // Default to media (data-only) upload protocol.
    const upload = uploadService.mediaUpload({
      bucketId: req.params.bucketId,
      objectId: objectId,
      dataRaw: await reqBodyToBuffer(req),
      authorization: req.header("authorization"),
    });
    return await finalizeOneShotUpload(upload);
  };

  const handleTokenRequest = (req: Request, res: Response) => {
    if (!req.query.create_token && !req.query.delete_token) {
      return res.sendStatus(400);
    }
    const bucketId = req.params.bucketId;
    const decodedObjectId = decodeURIComponent(req.params.objectId);
    const authorization = req.header("authorization");
    let metadata: StoredFileMetadata;
    if (req.query.create_token) {
      if (req.query.create_token !== "true") {
        return res.sendStatus(400);
      }
      try {
        metadata = storageLayer.createDownloadToken({
          bucketId,
          decodedObjectId,
          authorization,
        });
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return res.status(403).json({
            error: {
              code: 403,
              message: `Missing admin credentials.`,
            },
          });
        }
        if (err instanceof NotFoundError) {
          return res.sendStatus(404);
        }
        throw err;
      }
    } else {
      // delete download token
      try {
        metadata = storageLayer.deleteDownloadToken({
          bucketId,
          decodedObjectId,
          token: req.query["delete_token"]?.toString() ?? "",
          authorization,
        });
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return res.status(403).json({
            error: {
              code: 403,
              message: `Missing admin credentials.`,
            },
          });
        }
        if (err instanceof NotFoundError) {
          return res.sendStatus(404);
        }
        throw err;
      }
    }
    setObjectHeaders(res, metadata);
    return res.json(new OutgoingFirebaseMetadata(metadata));
  };

  const handleObjectPostRequest = async (req: Request, res: Response) => {
    if (req.query.create_token || req.query.delete_token) {
      return handleTokenRequest(req, res);
    }
    return handleUpload(req, res);
  };

  const handleMetadataUpdate = async (req: Request, res: Response) => {
    let metadata: StoredFileMetadata;
    try {
      metadata = await storageLayer.updateObjectMetadata({
        bucketId: req.params.bucketId,
        decodedObjectId: decodeURIComponent(req.params.objectId),
        metadata: req.body as IncomingMetadata,
        authorization: req.header("authorization"),
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return res.status(403).json({
          error: {
            code: 403,
            message: `Permission denied. No WRITE permission.`,
          },
        });
      }
      if (err instanceof NotFoundError) {
        return res.sendStatus(404);
      }
      throw err;
    }
    setObjectHeaders(res, metadata);
    return res.json(new OutgoingFirebaseMetadata(metadata));
  };

  firebaseStorageAPI.patch("/b/:bucketId/o/:objectId", handleMetadataUpdate);
  firebaseStorageAPI.put("/b/:bucketId/o/:objectId?", async (req, res) => {
    switch (req.header("x-http-method-override")?.toLowerCase()) {
      case "patch":
        return handleMetadataUpdate(req, res);
      default:
        return handleObjectPostRequest(req, res);
    }
  });

  firebaseStorageAPI.post("/b/:bucketId/o/:objectId?", handleObjectPostRequest);

  firebaseStorageAPI.delete("/b/:bucketId/o/:objectId", async (req, res) => {
    try {
      await storageLayer.deleteObject({
        bucketId: req.params.bucketId,
        decodedObjectId: decodeURIComponent(req.params.objectId),
        authorization: req.header("authorization"),
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return res.status(403).json({
          error: {
            code: 403,
            message: `Permission denied. No WRITE permission.`,
          },
        });
      }
      if (err instanceof NotFoundError) {
        return res.sendStatus(404);
      }
      throw err;
    }
    res.sendStatus(204);
  });

  firebaseStorageAPI.get("/", (req, res) => {
    res.json({ emulator: "storage" });
  });

  return firebaseStorageAPI;
}

function setObjectHeaders(res: Response, metadata: StoredFileMetadata): void {
  if (metadata.contentDisposition) {
    res.setHeader("Content-Disposition", metadata.contentDisposition);
  }
  if (metadata.contentEncoding) {
    res.setHeader("Content-Encoding", metadata.contentEncoding);
  }
  if (metadata.cacheControl) {
    res.setHeader("Cache-Control", metadata.cacheControl);
  }
  if (metadata.contentLanguage) {
    res.setHeader("Content-Language", metadata.contentLanguage);
  }
}

function isValidPrefix(prefix: string): boolean {
  // See go/firebase-storage-backend-valid-path
  return isValidNonEncodedPathString(removeAtMostOneTrailingSlash(prefix));
}

function isValidNonEncodedPathString(path: string): boolean {
  // See go/firebase-storage-backend-valid-path
  if (path.startsWith("/")) {
    path = path.substring(1);
  }
  if (!path) {
    return false;
  }
  for (const pathSegment of path.split("/")) {
    if (!pathSegment) {
      return false;
    }
  }
  return true;
}

function removeAtMostOneTrailingSlash(path: string): string {
  return path.replace(/\/$/, "");
}
