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
import { StorageLayer } from "../files";
import type { Request, Response } from "express";

/**
 * @param emulator
 * @param storage
 */
export function createCloudEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const gcloudStorageAPI = Router();
  const { storageLayer } = emulator;

  // Automatically create a bucket for any route which uses a bucket
  gcloudStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
    storageLayer.createBucket(req.params[0]);
    next();
  });

  gcloudStorageAPI.get("/b", (req, res) => {
    res.json({
      kind: "storage#buckets",
      items: storageLayer.listBuckets(),
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

      if (req.query.alt == "media") {
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

  gcloudStorageAPI.put("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
    if (!req.query.upload_id) {
      res.sendStatus(400);
      return;
    }

    const uploadId = req.query.upload_id.toString();

    const bufs: Buffer[] = [];
    req.on("data", (data) => {
      bufs.push(data);
    });

    await new Promise<void>((resolve) => {
      req.on("end", () => {
        req.body = Buffer.concat(bufs);
        resolve();
      });
    });

    let upload = storageLayer.uploadBytes(uploadId, req.body);

    if (!upload) {
      res.sendStatus(400);
      return;
    }

    const finalizedUpload = storageLayer.finalizeUpload(uploadId);
    if (!finalizedUpload) {
      res.sendStatus(400);
      return;
    }
    upload = finalizedUpload.upload;
    res.status(200).json(new CloudStorageObjectMetadata(finalizedUpload.file.metadata)).send();
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

  const MULTIPART_RE = /^multipart\/related/i;
  const BOUNDARY_RE = /;\s*boundary\s*=\s*(?:"([^"]*)"|([^;]*))/i;
  const SECTIONS_RE = /^(.*?)(\r?\n\r?\n)(.*)$/s;
  const HEADER_LINES_RE = /\r?\n/;
  const TRAILING_CRLF_RE = /(\r?\n)$/;
  const HEADER_KV_RE = /^([^:\s]+)?\s*:\s*?(.*)/;

  type MultipartHeaders = {
    [key: string]: string;
  };
  type MultpartFile = {
    contentType: string;
    buffer: Buffer;
    headers?: MultipartHeaders;
  };
  interface UploadMetadata extends IncomingMetadata {
    name?: string;
  }

  const getValidName = (req: Request, metadata: UploadMetadata): string | undefined => {
    const name = req?.query?.name?.toString() || metadata?.name;
    return name?.startsWith("/") ? name.slice(1) : name;
  };

  const splitHeaders = (headersString: string): MultipartHeaders => {
    return headersString.split(HEADER_LINES_RE).reduce((headers, rawHeader) => {
      const match = HEADER_KV_RE.exec(rawHeader);
      if (match) {
        headers[match[1].trim().toLowerCase()] = match[2].trim(); // Convert headers to lowercase to allow easier use later
      }
      return headers;
    }, {} as MultipartHeaders);
  };

  const splitMultipart = (contentType: string, body: Buffer): MultpartFile[] => {
    const [boundaryMatch, boundaryWithQuotes, boundaryWithoutQuotes] =
      BOUNDARY_RE.exec(contentType) || [];
    const boundary = boundaryMatch
      ? `--${(boundaryWithQuotes || boundaryWithoutQuotes).trim()}`
      : null;
    const files = <MultpartFile[]>[];

    if (boundary) {
      body
        .toString("binary")
        .split(boundary)
        .reduce((prev, bodyPart, i) => {
          const position = i * boundary.length + prev;
          const sections = SECTIONS_RE.exec(bodyPart);
          if (sections) {
            // Every file must have headers and body per spec
            const [, fileHeaders, separator, fileBody] = sections;
            const trailing = TRAILING_CRLF_RE.exec(fileBody);

            const headers = splitHeaders(fileHeaders);
            const contentType = headers["content-type"];
            if (contentType) {
              const bufferStart = position + fileHeaders.length + separator.length;
              const bufferEnd = bufferStart + fileBody.length - (trailing ? trailing[1].length : 0);
              const buffer = Buffer.from(body.slice(bufferStart, bufferEnd));
              files.push({ contentType, buffer, headers });
            }
          }
          return prev + bodyPart.length;
        }, 0);
    }
    return files.filter((f) => f?.headers);
  };

  gcloudStorageAPI.post("/upload/storage/v1/b/:bucketId/o", (req, res) => {
    const contentType = req.header("content-type") || req.header("x-upload-content-type");
    let metadata: UploadMetadata = {};
    let meta: MultpartFile | null = null;
    let blob: MultpartFile | null = null;

    if (!contentType) {
      res.sendStatus(400);
      return;
    }

    const resumable = req.query.uploadType == "resumable";
    if (resumable) {
      metadata = { contentType, ...req.body };
    } else {
      if (!MULTIPART_RE.exec(contentType)) {
        res.sendStatus(400);
        return;
      }
      const files = splitMultipart(contentType, req.body);
      if (files.length === 2) {
        [meta, blob] = files;
        metadata = { contentType: blob.contentType, ...JSON.parse(meta.buffer.toString()) };
      } else {
        // Multipart upload is invalid
        res.sendStatus(400);
        return;
      }
    }

    const name = getValidName(req, metadata);
    if (!name) {
      res.sendStatus(400);
      return;
    }

    if (resumable) {
      const emulatorInfo = EmulatorRegistry.getInfo(Emulators.STORAGE);
      if (emulatorInfo == undefined) {
        res.sendStatus(500);
        return;
      }

      const upload = storageLayer.startUpload(req.params.bucketId, name, contentType, metadata);
      const { host, port } = emulatorInfo;
      const uploadUrl = `http://${host}:${port}/upload/storage/v1/b/${upload.bucketId}/o?name=${upload.fileLocation}&uploadType=resumable&upload_id=${upload.uploadId}`;
      res.header("location", uploadUrl).status(200).send();
      return;
    } else {
      if (!blob) {
        res.sendStatus(400);
        return;
      }
      const uploadMetadata = storageLayer.oneShotUpload(
        req.params.bucketId,
        name,
        blob.contentType,
        metadata,
        blob.buffer
      );
      if (!uploadMetadata) {
        res.sendStatus(400);
        return;
      }

      res.status(200).json(new CloudStorageObjectMetadata(uploadMetadata)).send();
    }
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

  const isGZipped = md.contentEncoding == "gzip";
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
