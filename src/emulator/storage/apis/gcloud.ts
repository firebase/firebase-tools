import { Router } from "express";
import { gunzipSync } from "zlib";
import { Emulators } from "../../types";
import { CloudStorageObjectMetadata } from "../metadata";
import { EmulatorRegistry } from "../../registry";
import { StorageEmulator } from "../index";

/**
 * @param emulator
 * @param storage
 */
export function createCloudEndpoints(emulator: StorageEmulator): Router {
  // eslint-disable-next-line new-cap
  const gcloudStorageAPI = Router();
  const { storageLayer } = emulator;

  gcloudStorageAPI.get("/b", (req, res) => {
    res.json({
      kind: "storage#buckets",
      items: storageLayer.listBuckets(),
    });
  });

  // Automatically create a bucket for any route which uses a bucket
  gcloudStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
    storageLayer.createBucket(req.params[0]);
    next();
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
          res.setHeader(
            "Content-Range",
            `bytes ${range.start}-${range.end - 1}/${data.byteLength}`
          );
          res.status(206).end(data.slice(range.start, range.end));
        } else {
          res.end(data);
        }
        return;
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

  gcloudStorageAPI.post("/upload/storage/v1/b/:bucketId/o", (req, res) => {
    if (!req.query.name) {
      res.sendStatus(400);
      return;
    }
    let name = req.query.name.toString();

    if (name.startsWith("/")) {
      name = name.slice(1);
    }

    const contentType = req.header("content-type") || req.header("x-upload-content-type");

    if (!contentType) {
      res.sendStatus(400);
      return;
    }

    if (req.query.uploadType == "resumable") {
      const upload = storageLayer.startUpload(req.params.bucketId, name, contentType, req.body);
      const emulatorInfo = EmulatorRegistry.getInfo(Emulators.STORAGE);

      if (emulatorInfo == undefined) {
        res.sendStatus(500);
        return;
      }

      const { host, port } = emulatorInfo;
      const uploadUrl = `http://${host}:${port}/upload/storage/v1/b/${upload.bucketId}/o?name=${upload.fileLocation}&uploadType=resumable&upload_id=${upload.uploadId}`;
      res.header("location", uploadUrl).status(200).send();
      return;
    }

    if (!contentType.startsWith("multipart/related")) {
      res.sendStatus(400);
      return;
    }

    const boundary = `--${contentType.split("boundary=")[1]}`;
    const bodyString = req.body.toString();

    const bodyStringParts = bodyString.split(boundary).filter((v: string) => v);

    const metadataString = bodyStringParts[0].split(/\r?\n/)[3];
    const blobParts = bodyStringParts[1].split(/\r?\n/);
    const blobContentTypeString = blobParts[1];

    if (!blobContentTypeString || !blobContentTypeString.startsWith("Content-Type: ")) {
      res.sendStatus(400);
      return;
    }

    const blobContentType = blobContentTypeString.slice("Content-Type: ".length);
    const bodyBuffer = req.body as Buffer;

    const metadataSegment = `${boundary}${bodyString.split(boundary)[1]}`;
    const dataSegment = `${boundary}${bodyString.split(boundary).slice(2)[0]}`;
    const dataSegmentHeader = (dataSegment.match(/.+Content-Type:.+?\r?\n\r?\n/s) || [])[0];

    if (!dataSegmentHeader) {
      res.sendStatus(400);
      return;
    }

    const bufferOffset = metadataSegment.length + dataSegmentHeader.length;

    const blobBytes = Buffer.from(bodyBuffer.slice(bufferOffset, -`\r\n${boundary}--`.length));

    const metadata = storageLayer.oneShotUpload(
      req.params.bucketId,
      name,
      blobContentType,
      JSON.parse(metadataString),
      blobBytes
    );

    if (!metadata) {
      res.sendStatus(400);
      return;
    }

    res.status(200).json(new CloudStorageObjectMetadata(metadata)).send();
    return;
  });

  return gcloudStorageAPI;
}
