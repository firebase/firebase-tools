/**
 * Represents a parsed multipart form body for an upload object request.
 *
 * Note: This class and others in files deal directly with buffers as
 * converting to String can append unwanted encoding data to the original
 * blob data in the request.
 */
export type ObjectUploadMultipartData = {
  metadataRaw: string;
  dataRaw: Buffer;
};

/**
 * Represents a parsed multipart request body. Request bodies can have an
 * arbitrary number of parts.
 */
type MultipartRequestBody = {
  dataParts: MultipartRequestBodyPart[];
};

const LINE_SEPARATOR = `\r\n`;

/**
 * Parses a multipart request body buffer into a {@link MultipartRequestBody}.
 * @param boundaryId the boundary id of the multipart request
 * @param body multipart request body as a Buffer
 */
function parseMultipartRequestBody(boundaryId: string, body: Buffer): MultipartRequestBody {
  const boundaryString = `--${boundaryId}`;
  // Iterate through boundary-delineated parts and save to separate Buffers
  let offset = 0;
  let nextBoundaryIndex = body.indexOf(boundaryString, offset);
  const bodyParts: Buffer[] = [];
  while (nextBoundaryIndex !== -1) {
    if (offset !== nextBoundaryIndex) {
      bodyParts.push(Buffer.from(body.slice(offset, nextBoundaryIndex)));
    }
    offset = nextBoundaryIndex + boundaryString.length + LINE_SEPARATOR.length;
    nextBoundaryIndex = body.indexOf(boundaryString, offset);
  }
  // Parse each part Buffer separately.
  const parsedParts: MultipartRequestBodyPart[] = [];
  for (const bodyPart of bodyParts) {
    parsedParts.push(parseMultipartRequestBodyPart(bodyPart));
  }
  return { dataParts: parsedParts };
}

/**
 * Represents a single boundary-delineated multipart request body part,
 * Ex: """Content-Type: application/json\r
 * \r
 * {"contentType":"text/plain"}\r
 * """
 */
type MultipartRequestBodyPart = {
  // From the example above: "Content-Type: application/json"
  contentTypeRaw: string;
  // From the example above: '{"contentType":"text/plain"}'
  dataRaw: Buffer;
};

/**
 * Parses a string into a {@link MultipartRequestBodyPart}. We expect 3 sections
 * delineated by '\r\n':
 * 1: content type
 * 2: white space
 * 3: free form data 
 * @param bodyPart a multipart request body part as a Buffer
 */
function parseMultipartRequestBodyPart(bodyPart: Buffer): MultipartRequestBodyPart {
  // Parse Content-Type line
  let nextLineSeparatorIndex = bodyPart.indexOf(LINE_SEPARATOR, 0);
  let contentTypeRaw = Buffer.from(bodyPart.slice(0, nextLineSeparatorIndex)).toString();
  if (!contentTypeRaw.startsWith("Content-Type: ")) {
    throw new Error(`Failed to parse multipart request body part. Missing content type.`);
  }

  // Skip the next line break to account for white space padding.
  let offset = nextLineSeparatorIndex + LINE_SEPARATOR.length;
  nextLineSeparatorIndex = bodyPart.indexOf(LINE_SEPARATOR, offset);
  if (nextLineSeparatorIndex === -1) {
    throw new Error("Encountered malformed request body part.");
  }
  offset = nextLineSeparatorIndex + LINE_SEPARATOR.length;

  // Trim final line separator from data payload.
  let dataRaw = Buffer.from(bodyPart.slice(offset, bodyPart.length - LINE_SEPARATOR.length));
  return { contentTypeRaw, dataRaw };
}

/**
 * Parses a multipart form request for a file upload into its parts.
 * @param contentTypeHeader value of ContentType header passed in request.
 *     Example: "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e"
 * @param body string value of the body of the multipart request.
 *     Example: """--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
 *     Content-Type: application/json\r
 *     \r
 *     {"contentType":"text/plain"}\r
 *     --b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
 *     Content-Type: text/plain\r
 *     \r
 *     �ZDn�QF�&�\r
 *     --b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
 *     """
 */
export function parseObjectUploadMultipartRequest(
  contentTypeHeader: string,
  body: Buffer
): ObjectUploadMultipartData {
  if (!contentTypeHeader.startsWith("multipart/related")) {
    throw new Error(`Invalid Content-Type: ${contentTypeHeader}`);
  }
  const boundaryId = contentTypeHeader.split("boundary=")[1];
  if (!boundaryId) {
    throw new Error(`Invalid Content-Type header: ${contentTypeHeader}`);
  }
  const parsed = parseMultipartRequestBody(boundaryId, body);
  if (parsed.dataParts.length !== 2) {
    throw new Error(`Unexpected number of parts in request body`);
  }
  return {
    metadataRaw: parsed.dataParts[0].dataRaw.toString(),
    dataRaw: Buffer.from(parsed.dataParts[1].dataRaw),
  };
}