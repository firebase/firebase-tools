/** Represents a parsed multipart form body for an upload object request. */
export type ObjectUploadMultipartData = {
  metadataRaw: string;
  dataRaw: string;
};

/**
 * Represents a parsed multipart request body. Request bodies can have an
 * arbitrary number of parts.
 */
type MultipartRequestBody = {
  dataParts: MultipartRequestBodyPart[];
};

/**
 * Parses a string into a {@link MultipartRequestBody}.
 * @param boundaryId the boundary id of the multipart request
 * @param body string value of a multipart request body
 */
function parseMultipartRequestBody(boundaryId: string, body: string): MultipartRequestBody {
  const boundaryString = `--${boundaryId}`;
  const bodyParts = body.split(boundaryString).map((part) => {
    // Strip leading \r\n. Avoid using trim to avoid stripping out intentional whitespace in the data payload.
    return part.slice(0, 2) === "\r\n" ? part.slice(2) : part;
  });
  if (bodyParts[bodyParts.length - 1] !== "--\r\n") {
    throw new Error(`Failed to parse multipart request body: ${body}`);
  }
  const parsedParts: MultipartRequestBodyPart[] = [];
  for (const bodyPart of bodyParts.slice(1, bodyParts.length - 1)) {
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
  dataRaw: string;
};

/**
 * Parses a string into a {@link MultipartRequestBodyPart}.
 * @param bodyPart a multipart request body part string, not including boundaries.
 */
function parseMultipartRequestBodyPart(bodyPart: string): MultipartRequestBodyPart {
  const parts = bodyPart.split("\r\n");
  // Parts:
  //   0: content type
  //   1: white space
  //   2: data
  //   3: empty
  if (parts.length !== 4) {
    throw new Error(`Failed to parse multipart request body part: ${bodyPart}`);
  }
  if (!parts[0].startsWith("Content-Type: ")) {
    throw new Error(
      `Failed to parse multipart request body part: ${bodyPart}. Missing content type.`
    );
  }
  return { contentTypeRaw: parts[0], dataRaw: parts[2] };
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
  body: string
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
    throw new Error(`Unexpected number of parts in request body: ${body}`);
  }
  return {
    metadataRaw: parsed.dataParts[0].dataRaw,
    dataRaw: parsed.dataParts[1].dataRaw,
  };
}
