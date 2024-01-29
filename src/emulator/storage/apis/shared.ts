import { gunzipSync } from "zlib";
import { StoredFileMetadata } from "../metadata";
import { Request, Response } from "express";
import { crc32cToString } from "../crc";

/** Populates an object media GET Express response. */
export function sendFileBytes(
  md: StoredFileMetadata,
  data: Buffer,
  req: Request,
  res: Response,
): void {
  let didGunzip = false;
  if (md.contentEncoding === "gzip") {
    const acceptEncoding = req.header("accept-encoding") || "";
    const shouldGunzip = !acceptEncoding.includes("gzip");
    if (shouldGunzip) {
      data = gunzipSync(data);
      didGunzip = true;
    }
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", md.contentType || "application/octet-stream");

  // remove the folder name from the downloaded file name
  const fileName = md.name.split("/").pop();
  res.setHeader(
    "Content-Disposition",
    `${md.contentDisposition || "attachment"}; filename=${fileName}`,
  );
  if (didGunzip) {
    // Set to mirror server behavior and supress express's "content-length" header.
    res.setHeader("Transfer-Encoding", "chunked");
  } else {
    // Don't populate Content-Encoding if decompressed, see
    // https://cloud.google.com/storage/docs/transcoding#decompressive_transcoding.
    res.setHeader("Content-Encoding", md.contentEncoding || "");
  }
  res.setHeader("ETag", md.etag);
  res.setHeader("Cache-Control", md.cacheControl || "");
  res.setHeader("x-goog-generation", `${md.generation}`);
  res.setHeader("x-goog-metadatageneration", `${md.metageneration}`);
  res.setHeader("x-goog-storage-class", md.storageClass);
  res.setHeader("x-goog-hash", `crc32c=${crc32cToString(md.crc32c)},md5=${md.md5Hash}`);

  // Content Range headers should be respected only if data was not decompressed, see
  // https://cloud.google.com/storage/docs/transcoding#range.
  const shouldRespectContentRange = !didGunzip;
  if (shouldRespectContentRange) {
    const byteRange = req.range(data.byteLength, { combine: true });
    if (Array.isArray(byteRange) && byteRange.type === "bytes" && byteRange.length > 0) {
      const range = byteRange[0];
      res.setHeader(
        "Content-Range",
        `${byteRange.type} ${range.start}-${range.end}/${data.byteLength}`,
      );
      // Byte range requests are inclusive for start and end
      res.status(206).end(data.slice(range.start, range.end + 1));
      return;
    }
  }
  res.end(data);
}
