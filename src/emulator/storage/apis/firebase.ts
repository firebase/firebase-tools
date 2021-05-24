import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { gunzipSync } from "zlib";
import { OutgoingFirebaseMetadata, RulesResourceMetadata, StoredFileMetadata } from "../metadata";
import * as mime from "mime";
import { Request, Response, Router } from "express";
import { StorageEmulator } from "../index";
import { EmulatorRegistry } from "../../registry";
import { StorageRulesetInstance } from "../rules/runtime";
import { RulesetOperationMethod } from "../rules/types";

async function isPermitted(opts: {
  ruleset?: StorageRulesetInstance;
  file: {
    before?: RulesResourceMetadata;
    after?: RulesResourceMetadata;
  };
  path: string;
  method: RulesetOperationMethod;
  authorization?: string;
}): Promise<boolean> {
  if (!opts.ruleset) {
    EmulatorLogger.forEmulator(Emulators.STORAGE).log(
      "WARN",
      `Can not process SDK request with no loaded ruleset`
    );
    return false;
  }

  // Skip auth for UI
  if (["Bearer owner", "Firebase owner"].includes(opts.authorization || "")) {
    return true;
  }

  const { permitted, issues } = await opts.ruleset.verify({
    method: opts.method,
    path: opts.path,
    file: opts.file,
    token: opts.authorization ? opts.authorization.split(" ")[1] : undefined,
  });

  if (issues.exist()) {
    issues.all.forEach((warningOrError) => {
      EmulatorLogger.forEmulator(Emulators.STORAGE).log("WARN", warningOrError);
    });
  }

  return !!permitted;
}

/**
 * @param emulator
 */
export function createFirebaseEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const firebaseStorageAPI = Router();
  const { storageLayer } = emulator;

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
    const decodedObjectId = decodeURIComponent(req.params.objectId);
    const operationPath = ["b", req.params.bucketId, "o", decodedObjectId].join("/");
    const md = storageLayer.getMetadata(req.params.bucketId, decodedObjectId);

    const rulesFiles: {
      before?: RulesResourceMetadata;
    } = {};

    if (md) {
      rulesFiles.before = md.asRulesResource();
    }

    // Query values are used for GETs from Web SDKs
    const isPermittedViaHeader = await isPermitted({
      ruleset: emulator.rules,
      method: RulesetOperationMethod.GET,
      path: operationPath,
      file: rulesFiles,
      authorization: req.header("authorization"),
    });

    // Token headers are used for GETs from Mobile SDKs
    const isPermittedViaToken =
      req.query.token && md && md.downloadTokens.includes(req.query.token.toString());

    const isRequestPermitted: boolean = isPermittedViaHeader || !!isPermittedViaToken;

    if (!isRequestPermitted) {
      res.sendStatus(403);
      return;
    }

    if (!md) {
      res.sendStatus(404);
      return;
    }

    let isGZipped = false;
    if (md.contentEncoding == "gzip") {
      isGZipped = true;
    }

    if (req.query.alt == "media") {
      let data = storageLayer.getBytes(req.params.bucketId, req.params.objectId);
      if (!data) {
        res.sendStatus(404);
        return;
      }

      if (isGZipped) {
        data = gunzipSync(data);
      }

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", md.contentType);
      setObjectHeaders(res, md, { "Content-Encoding": isGZipped ? "identity" : undefined });

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

    res.json(new OutgoingFirebaseMetadata(md));
  });

  const handleMetadataUpdate = async (req: Request, res: Response) => {
    const md = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

    if (!md) {
      res.sendStatus(404);
      return;
    }

    const decodedObjectId = decodeURIComponent(req.params.objectId);
    const operationPath = ["b", req.params.bucketId, "o", decodedObjectId].join("/");

    if (
      !(await isPermitted({
        ruleset: emulator.rules,
        method: RulesetOperationMethod.UPDATE,
        path: operationPath,
        authorization: req.header("authorization"),
        file: {
          before: md.asRulesResource(),
          after: md.asRulesResource(req.body), // TODO
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

    md.update(req.body);

    setObjectHeaders(res, md);
    const outgoingMetadata = new OutgoingFirebaseMetadata(md);
    res.json(outgoingMetadata);
    return;
  };

  // list object handler
  firebaseStorageAPI.get("/b/:bucketId/o", async (req, res) => {
    let maxRes = undefined;
    if (req.query.maxResults) {
      maxRes = +req.query.maxResults.toString();
    }
    const delimiter = req.query.delimiter ? req.query.delimiter.toString() : "/";
    const pageToken = req.query.pageToken ? req.query.pageToken.toString() : undefined;
    const prefix = req.query.prefix ? req.query.prefix.toString() : "";

    const operationPath = ["b", req.params.bucketId, "o", prefix].join("/");

    if (
      !(await isPermitted({
        ruleset: emulator.rules,
        method: RulesetOperationMethod.LIST,
        path: operationPath,
        file: {},
        authorization: req.header("authorization"),
      }))
    ) {
      return res.status(403).json({
        error: {
          code: 403,
          message: `Permission denied. No LIST permission.`,
        },
      });
    }

    res.json(
      storageLayer.listItemsAndPrefixes(req.params.bucketId, prefix, delimiter, pageToken, maxRes)
    );
  });

  const handleUpload = async (req: Request, res: Response) => {
    if (req.query.create_token || req.query.delete_token) {
      const decodedObjectId = decodeURIComponent(req.params.objectId);
      const operationPath = ["b", req.params.bucketId, "o", decodedObjectId].join("/");

      const mdBefore = storageLayer.getMetadata(req.params.bucketId, req.params.objectId);

      if (
        !(await isPermitted({
          ruleset: emulator.rules,
          method: RulesetOperationMethod.UPDATE,
          path: operationPath,
          authorization: req.header("authorization"),
          file: {
            before: mdBefore?.asRulesResource(),
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

      if (!mdBefore) {
        return res.status(404).json({
          error: {
            code: 404,
            message: `Request object can not be found`,
          },
        });
      }

      const createTokenParam = req.query["create_token"];
      const deleteTokenParam = req.query["delete_token"];
      let md: StoredFileMetadata | undefined;

      if (createTokenParam) {
        if (createTokenParam != "true") {
          res.sendStatus(400);
          return;
        }
        md = storageLayer.addDownloadToken(req.params.bucketId, req.params.objectId);
      } else if (deleteTokenParam) {
        md = storageLayer.deleteDownloadToken(
          req.params.bucketId,
          req.params.objectId,
          deleteTokenParam.toString()
        );
      }

      if (!md) {
        res.sendStatus(404);
        return;
      }

      setObjectHeaders(res, md);
      return res.json(new OutgoingFirebaseMetadata(md));
    }

    if (!req.query.name) {
      res.sendStatus(400);
      return;
    }

    const name = req.query.name.toString();
    const uploadType = req.header("x-goog-upload-protocol");

    if (uploadType == "multipart") {
      const contentType = req.header("content-type");
      if (!contentType || !contentType.startsWith("multipart/related")) {
        res.sendStatus(400);
        return;
      }

      const boundary = `--${contentType.split("boundary=")[1]}`;
      const bodyString = req.body.toString();
      const bodyStringParts = bodyString.split(boundary).filter((v: string) => v);

      const metadataString = bodyStringParts[0].split("\r\n")[3];
      const blobParts = bodyStringParts[1].split("\r\n");
      const blobContentTypeString = blobParts[1];
      if (!blobContentTypeString || !blobContentTypeString.startsWith("Content-Type: ")) {
        res.sendStatus(400);
        return;
      }
      const blobContentType = blobContentTypeString.slice("Content-Type: ".length);
      const bodyBuffer = req.body as Buffer;

      const metadataSegment = `${boundary}${bodyString.split(boundary)[1]}`;
      const dataSegment = `${boundary}${bodyString.split(boundary).slice(2)[0]}`;
      const dataSegmentHeader = (dataSegment.match(/.+Content-Type:.+?\r\n\r\n/s) || [])[0];

      if (!dataSegmentHeader) {
        res.sendStatus(400);
        return;
      }

      const bufferOffset = metadataSegment.length + dataSegmentHeader.length;

      const blobBytes = Buffer.from(bodyBuffer.slice(bufferOffset, -`\r\n${boundary}--`.length));
      const md = storageLayer.oneShotUpload(
        req.params.bucketId,
        name,
        blobContentType,
        JSON.parse(metadataString),
        Buffer.from(blobBytes)
      );

      if (!md) {
        res.sendStatus(400);
        return;
      }

      const operationPath = ["b", req.params.bucketId, "o", name].join("/");

      if (
        !(await isPermitted({
          ruleset: emulator.rules,
          // TODO: This will be either create or update
          method: RulesetOperationMethod.CREATE,
          path: operationPath,
          authorization: req.header("authorization"),
          file: {
            after: md?.asRulesResource(),
          },
        }))
      ) {
        storageLayer.deleteFile(md?.bucket, md?.name);
        return res.status(403).json({
          error: {
            code: 403,
            message: `Permission denied. No WRITE permission.`,
          },
        });
      }

      if (md.downloadTokens.length == 0) {
        md.addDownloadToken();
      }

      res.json(new OutgoingFirebaseMetadata(md));
      return;
    } else {
      const operationPath = ["b", req.params.bucketId, "o", name].join("/");
      const uploadCommand = req.header("x-goog-upload-command");
      if (!uploadCommand) {
        res.sendStatus(400);
        return;
      }

      if (uploadCommand == "start") {
        let objectContentType =
          req.header("x-goog-upload-header-content-type") ||
          req.header("x-goog-upload-content-type");
        if (!objectContentType) {
          const mimeTypeFromName = mime.getType(name);
          if (!mimeTypeFromName) {
            objectContentType = "application/octet-stream";
          } else {
            objectContentType = mimeTypeFromName;
          }
        }

        const upload = storageLayer.startUpload(
          req.params.bucketId,
          name,
          objectContentType,
          req.body
        );

        storageLayer.uploadBytes(upload.uploadId, Buffer.alloc(0));

        const emulatorInfo = EmulatorRegistry.getInfo(Emulators.STORAGE);

        res.header("x-goog-upload-chunk-granularity", "10000");
        res.header("x-goog-upload-control-url", "");
        res.header("x-goog-upload-status", "active");
        res.header(
          "x-goog-upload-url",
          `http://${req.hostname}:${emulatorInfo?.port}/v0/b/${req.params.bucketId}/o?name=${req.query.name}&upload_id=${upload.uploadId}&upload_protocol=resumable`
        );
        res.header("x-gupload-uploadid", upload.uploadId);

        res.status(200).send();
        return;
      }

      if (!req.query.upload_id) {
        res.sendStatus(400);
        return;
      }

      const uploadId = req.query.upload_id.toString();
      if (uploadCommand == "query") {
        const upload = storageLayer.queryUpload(uploadId);
        if (!upload) {
          res.sendStatus(400);
          return;
        }

        res.header("X-Goog-Upload-Size-Received", upload.currentBytesUploaded.toString());
        res.sendStatus(200);
        return;
      }

      if (uploadCommand == "cancel") {
        const upload = storageLayer.cancelUpload(uploadId);
        if (!upload) {
          res.sendStatus(400);
          return;
        }
        res.sendStatus(200);
        return;
      }

      let upload;
      if (uploadCommand.includes("upload")) {
        if (!(req.body instanceof Buffer)) {
          const bufs: Buffer[] = [];
          req.on("data", (data) => {
            bufs.push(data);
          });

          await new Promise((resolve) => {
            req.on("end", () => {
              req.body = Buffer.concat(bufs);
              resolve();
            });
          });
        }

        upload = storageLayer.uploadBytes(uploadId, req.body);

        if (!upload) {
          res.sendStatus(400);
          return;
        }

        res.header("x-goog-upload-status", "active");
        res.header("x-gupload-uploadid", upload.uploadId);
      }

      if (uploadCommand.includes("finalize")) {
        const finalizedUpload = storageLayer.finalizeUpload(uploadId);
        if (!finalizedUpload) {
          res.sendStatus(400);
          return;
        }
        upload = finalizedUpload.upload;

        res.header("x-goog-upload-status", "final");

        // For resumable uploads, we check auth on finalization in case of byte-dependant rules
        if (
          !(await isPermitted({
            ruleset: emulator.rules,
            // TODO This will be either create or update
            method: RulesetOperationMethod.CREATE,
            path: operationPath,
            authorization: req.header("authorization"),
            file: {
              after: storageLayer.getMetadata(req.params.bucketId, name)?.asRulesResource(),
            },
          }))
        ) {
          storageLayer.deleteFile(upload.bucketId, name);
          return res.status(403).json({
            error: {
              code: 403,
              message: `Permission denied. No WRITE permission.`,
            },
          });
        }

        const md = finalizedUpload.file.metadata;
        if (md.downloadTokens.length == 0) {
          md.addDownloadToken();
        }

        res.json(new OutgoingFirebaseMetadata(finalizedUpload.file.metadata));
      } else if (!upload) {
        res.sendStatus(400);
        return;
      } else {
        res.sendStatus(200);
      }
    }
  };

  // update metata handler
  firebaseStorageAPI.patch("/b/:bucketId/o/:objectId", handleMetadataUpdate);
  firebaseStorageAPI.put("/b/:bucketId/o/:objectId?", async (req, res) => {
    switch (req.header("x-http-method-override")?.toLowerCase()) {
      case "patch":
        return handleMetadataUpdate(req, res);
      default:
        return handleUpload(req, res);
    }
  });
  firebaseStorageAPI.post("/b/:bucketId/o/:objectId?", handleUpload);

  firebaseStorageAPI.delete("/b/:bucketId/o/:objectId", async (req, res) => {
    const decodedObjectId = decodeURIComponent(req.params.objectId);
    const operationPath = ["b", req.params.bucketId, "o", decodedObjectId].join("/");

    if (
      !(await isPermitted({
        ruleset: emulator.rules,
        method: RulesetOperationMethod.DELETE,
        path: operationPath,
        authorization: req.header("authorization"),
        file: {
          // TODO load before metadata
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

    const md = storageLayer.getMetadata(req.params.bucketId, decodedObjectId);

    if (!md) {
      res.sendStatus(404);
      return;
    }

    storageLayer.deleteFile(req.params.bucketId, req.params.objectId);
    res.sendStatus(200);
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
