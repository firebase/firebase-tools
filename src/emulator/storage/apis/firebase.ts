import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { gunzipSync } from "zlib";
import {
  IncomingMetadata,
  OutgoingFirebaseMetadata,
  RulesResourceMetadata,
  StoredFileMetadata,
} from "../metadata";
import * as mime from "mime";
import { Request, Response, Router } from "express";
import { StorageEmulator } from "../index";
import { EmulatorRegistry } from "../../registry";
import { RulesetOperationMethod } from "../rules/types";
import { parseObjectUploadMultipartRequest } from "../multipart";
import { NotFoundError, ForbiddenError } from "../errors";
import { isPermitted } from "../rules/utils";
import { NotCancellableError, Upload, UploadNotActiveError } from "../upload";
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

  firebaseStorageAPI.use((req, res, next) => {
    if (!emulator.rules) {
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

  // Automatically create a bucket for any route which uses a bucket
  firebaseStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
    storageLayer.createBucket(req.params[0]);
    next();
  });

  firebaseStorageAPI.get("/b/:bucketId/o/:objectId", async (req, res) => {
    let metadata: StoredFileMetadata;
    let data: Buffer;
    try {
      // Both object data and metadata get can use the same handler since they share auth logic.
      ({ metadata, data } = await storageLayer.handleGetObject({
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

      const byteRange = [...(req.header("range") || "").split("bytes="), "", ""];
      const [rangeStart, rangeEnd] = byteRange[1].split("-");
      if (rangeStart) {
        const range = {
          start: parseInt(rangeStart),
          end: rangeEnd ? parseInt(rangeEnd) : data.byteLength,
        };
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end - 1}/${data.byteLength}`);
        return res.status(206).end(data.slice(range.start, range.end));
      }
      return res.end(data);
    }

    // Object metadata request
    return res.json(new OutgoingFirebaseMetadata(metadata));
  });

  const handleMetadataUpdate = async (req: Request, res: Response) => {
    let metadata: StoredFileMetadata;
    try {
      metadata = await storageLayer.handleUpdateObjectMetadata({
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

  // list object handler
  firebaseStorageAPI.get("/b/:bucketId/o", async (req, res) => {
    let maxResults = req.query.maxResults?.toString();
    let response: ListObjectsResponse;
    try {
      response = await storageLayer.handleListObjects({
        bucketId: req.params.bucketId,
        prefix: req.query.prefix ? req.query.prefix.toString() : "",
        delimiter: req.query.delimiter ? req.query.delimiter.toString() : "/",
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
    return res.json(response.result);
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

  const handleUpload = async (req: Request, res: Response) => {
    const bucketId = req.params.bucketId;
    if (req.query.create_token || req.query.delete_token) {
      const decodedObjectId = decodeURIComponent(req.params.objectId);
      const operationPath = ["b", bucketId, "o", decodedObjectId].join("/");
      const metadataBefore = storageLayer.getMetadata(bucketId, req.params.objectId);

      // TODO(tonyjhuang): Replace this Firebase Rules check with an admin-only auth check
      // as token management endpoints should only accept admin credentials.
      if (
        !(await isPermitted({
          ruleset: emulator.rules,
          method: RulesetOperationMethod.UPDATE,
          path: operationPath,
          authorization: req.header("authorization"),
          file: {
            before: metadataBefore?.asRulesResource(),
            // TODO: before and after w/ metadata change
          },
        }))
      ) {
        return res.status(403).json({
          error: {
            code: 403,
            message: `Permission denied. No WRITE permission.`,
          },
        });
      }

      if (!metadataBefore) {
        return res.status(404).json({
          error: {
            code: 404,
            message: `Request object can not be found`,
          },
        });
      }

      const createTokenParam = req.query["create_token"];
      const deleteTokenParam = req.query["delete_token"];
      let metadata: StoredFileMetadata | undefined;

      if (createTokenParam) {
        if (createTokenParam !== "true") {
          res.sendStatus(400);
          return;
        }
        metadata = storageLayer.addDownloadToken(req.params.bucketId, req.params.objectId);
      } else if (deleteTokenParam) {
        metadata = storageLayer.deleteDownloadToken(
          req.params.bucketId,
          req.params.objectId,
          deleteTokenParam.toString()
        );
      }

      if (!metadata) {
        res.sendStatus(404);
        return;
      }

      setObjectHeaders(res, metadata);
      return res.json(new OutgoingFirebaseMetadata(metadata));
    }

    if (!req.query.name) {
      res.sendStatus(400);
      return;
    }

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
              message: err.toString(),
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
        metadata = await storageLayer.handleUploadObject(upload);
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
      metadata.addDownloadToken();
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
      const emulatorInfo = EmulatorRegistry.getInfo(Emulators.STORAGE);
      res.header(
        "x-goog-upload-url",
        `http://${req.hostname}:${emulatorInfo?.port}/v0/b/${bucketId}/o?name=${objectId}&upload_id=${upload.id}&upload_protocol=resumable`
      );
      res.header("x-gupload-uploadid", upload.id);

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
      let metadata: StoredFileMetadata;
      try {
        metadata = await storageLayer.handleUploadObject(upload);
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
      metadata.addDownloadToken();
      return res.status(200).json(new OutgoingFirebaseMetadata(metadata));
    }

    // Unsupported upload command.
    return res.sendStatus(400);
  };

  // update metadata handler
  firebaseStorageAPI.patch("/b/:bucketId/o/:objectId", handleMetadataUpdate);
  firebaseStorageAPI.put("/b/:bucketId/o/:objectId?", async (req, res) => {
    switch (req.header("x-http-method-override")?.toLowerCase()) {
      case "patch":
        return await handleMetadataUpdate(req, res);
      default:
        return await handleUpload(req, res);
    }
  });
  firebaseStorageAPI.post("/b/:bucketId/o/:objectId?", handleUpload);

  firebaseStorageAPI.delete("/b/:bucketId/o/:objectId", async (req, res) => {
    try {
      await storageLayer.handleDeleteObject({
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
