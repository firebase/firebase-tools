import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { gunzipSync } from "zlib";
import { IncomingMetadata, OutgoingFirebaseMetadata, StoredFileMetadata } from "../metadata";
import { Request, Response, Router } from "express";
import { StorageEmulator } from "../index";
import { EmulatorRegistry } from "../../registry";
import { parseObjectUploadMultipartRequest } from "../multipart";
import { NotFoundError, ForbiddenError } from "../errors";
import { NotCancellableError, Upload, UploadNotActiveError } from "../upload";
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
      console.log("--------------INCOMING REQUEST--------------");
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
        "Permission denied because no Storage ruleset is currently loaded, check your rules for syntax errors."
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

    if (!metadata!.downloadTokens.length) {
      metadata!.addDownloadToken();
    }

    // Object data request
    if (req.query.alt === "media") {
      const isGZipped = metadata.contentEncoding === "gzip";
      if (isGZipped) {
        data = gunzipSync(data);
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", metadata.contentType);
      setObjectHeaders(res, metadata, { "Content-Encoding": isGZipped ? "identity" : undefined });

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
      return;
    }

    // Object metadata request
    return res.json(new OutgoingFirebaseMetadata(metadata));
  });

  // list object handler
  firebaseStorageAPI.get("/b/:bucketId/o", async (req, res) => {
    const maxResults = req.query.maxResults?.toString();
    let listResponse: ListObjectsResponse;
    try {
      listResponse = await storageLayer.listObjects({
        bucketId: req.params.bucketId,
        prefix: req.query.prefix ? req.query.prefix.toString() : "",
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
      prefixes: listResponse.prefixes ?? [],
      items:
        listResponse.items?.map((item) => {
          return { name: item.name, bucket: item.bucket };
        }) ?? [],
    });
  });

  const handleUpload = async (req: Request, res: Response) => {
    if (!req.query.name) {
      res.sendStatus(400);
      return;
    }

    const bucketId = req.params.bucketId;
    const objectId = req.query.name.toString();
    const uploadType = req.header("x-goog-upload-protocol");

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
        bucketId,
        objectId,
        metadataRaw,
        dataRaw: dataRaw,
        authorization: req.header("authorization"),
      });
      let metadata: StoredFileMetadata;
      try {
        metadata = await storageLayer.uploadObject(upload);
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return res.status(403).json({
            error: {
              code: 403,
              message: "Permission denied. No WRITE permission.",
            },
          });
        }
        throw err;
      }
      metadata.addDownloadToken(/* shouldTrigger = */ false);
      return res.status(200).json(new OutgoingFirebaseMetadata(metadata));
    }

    // Resumable upload
    const uploadCommand = req.header("x-goog-upload-command");
    if (!uploadCommand) {
      res.sendStatus(400);
      return;
    }

    if (uploadCommand === "start") {
      const upload = uploadService.startResumableUpload({
        bucketId,
        objectId,
        metadataRaw: JSON.stringify(req.body),
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
          return res.sendStatus(404);
        } else if (err instanceof UploadNotActiveError) {
          return res.sendStatus(400);
        }
        throw err;
      }

      let storedMetadata: StoredFileMetadata;
      try {
        storedMetadata = await storageLayer.uploadObject(upload);
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return res.status(403).json({
            error: {
              code: 403,
              message: `Permission denied. No WRITE permission.`,
            },
          });
        }
        throw err;
      }

      res.header("x-goog-upload-status", "final");
      storedMetadata.addDownloadToken(/* shouldTrigger = */ false);
      return res.status(200).json(new OutgoingFirebaseMetadata(storedMetadata));
    }

    // Unsupported upload command.
    return res.sendStatus(400);
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

function setObjectHeaders(
  res: Response,
  metadata: StoredFileMetadata,
  headerOverride: {
    "Content-Encoding": string | undefined;
  } = { "Content-Encoding": undefined }
): void {
  res.setHeader("Content-Disposition", metadata.contentDisposition);

  if (headerOverride["Content-Encoding"]) {
    res.setHeader("Content-Encoding", headerOverride["Content-Encoding"]);
  } else {
    res.setHeader("Content-Encoding", metadata.contentEncoding);
  }

  if (metadata.cacheControl) {
    res.setHeader("Cache-Control", metadata.cacheControl);
  }

  if (metadata.contentLanguage) {
    res.setHeader("Content-Language", metadata.contentLanguage);
  }
}
