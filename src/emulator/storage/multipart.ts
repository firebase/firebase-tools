/** Represents a multipart form request body. */
export type MultipartData = {
  metadataRaw: string;
  dataRaw: string;
};

/** Parses a multipart form request into its parts. */
export function parseMultipartRequest(contentTypeHeader: string, body: string): MultipartData {
  if (!contentTypeHeader.startsWith("multipart/related")) {
    throw new Error(`Invalid ContentType: ${contentTypeHeader}`);
  }

  const boundary = `--${contentTypeHeader.split("boundary=")[1]}`;
  const bodyStringParts = body.split(boundary).filter((v: string) => v);

  const metadataString = bodyStringParts[0].split("\r\n")[3];
  const blobParts = bodyStringParts[1].split("\r\n");
  const blobContentTypeString = blobParts[1];
  if (!blobContentTypeString || !blobContentTypeString.startsWith("Content-Type: ")) {
    throw new Error("Failed to parse multipart data");
  }

  const metadataSegment = `${boundary}${body.split(boundary)[1]}`;
  const dataSegment = `${boundary}${body.split(boundary).slice(2)[0]}`;
  const dataSegmentHeader = (dataSegment.match(/.+Content-Type:.+?\r\n\r\n/s) || [])[0];

  if (!dataSegmentHeader) {
    throw new Error("Failed to parse multipart data");
  }

  const bufferOffset = metadataSegment.length + dataSegmentHeader.length;
  body.slice(bufferOffset, -`\r\n${boundary}--`.length);
  return {
    metadataRaw: metadataString,
    dataRaw: body.slice(bufferOffset, -`\r\n${boundary}--`.length),
  };
}
