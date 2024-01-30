/**
 * Represents a parsed multipart form body for an upload object request.
 *
 * Note: This class and others in files deal directly with buffers as
 * converting to String can append unwanted encoding data to the blob data
 * passed in the original request.
 */
export type ObjectUploadMultipartData = {
  metadataRaw: string;
  dataRaw: Buffer;
};

/**
 * Represents a parsed multipart request body. Request bodies can have an
 * arbitrary number of parts.
 */
type MultipartRequestBody = MultipartRequestBodyPart[];

const LINE_SEPARATOR = `\r\n`;

/**
 * Returns an array of Buffers constructed by splitting a Buffer on a delimiter.
 * @param maxResults Returns at most this many results. Any slices remaining in the
 *     original buffer will be returned as a single Buffer at the end
 */
function splitBufferByDelimiter(buffer: Buffer, delimiter: string, maxResults = -1): Buffer[] {
  // Iterate through delimited slices and save to separate Buffers
  let offset = 0;
  let nextDelimiterIndex = buffer.indexOf(delimiter, offset);
  const bufferParts: Buffer[] = [];
  while (nextDelimiterIndex !== -1) {
    if (maxResults === 0) {
      return bufferParts;
    } else if (maxResults === 1) {
      // Save the rest of the buffer as one slice and return.
      bufferParts.push(Buffer.from(buffer.slice(offset)));
      return bufferParts;
    }
    bufferParts.push(Buffer.from(buffer.slice(offset, nextDelimiterIndex)));
    offset = nextDelimiterIndex + delimiter.length;
    nextDelimiterIndex = buffer.indexOf(delimiter, offset);
    maxResults -= 1;
  }
  bufferParts.push(Buffer.from(buffer.slice(offset)));
  return bufferParts;
}

/**
 * Parses a multipart request body buffer into a {@link MultipartRequestBody}.
 * @param boundaryId the boundary id of the multipart request
 * @param body multipart request body as a Buffer
 */
function parseMultipartRequestBody(boundaryId: string, body: Buffer): MultipartRequestBody {
  // strip additional surrounding single and double quotes, cloud sdks have additional quote here
  const cleanBoundaryId = boundaryId.replace(/^["'](.+(?=["']$))["']$/, "$1");
  const boundaryString = `--${cleanBoundaryId}`;
  const bodyParts = splitBufferByDelimiter(body, boundaryString).map((buf) => {
    // Remove the \r\n and the beginning of each part left from the boundary line.
    return Buffer.from(buf.slice(2));
  });
  // A valid split request body should have two extra Buffers, one at the beginning and end.
  const parsedParts: MultipartRequestBodyPart[] = [];
  for (const bodyPart of bodyParts.slice(1, bodyParts.length - 1)) {
    parsedParts.push(parseMultipartRequestBodyPart(bodyPart));
  }
  return parsedParts;
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
  // The free form data section may have \r\n data in it so glob it together rather than
  // splitting the entire body part buffer.
  const sections = splitBufferByDelimiter(bodyPart, LINE_SEPARATOR, /* maxResults = */ 3);

  const contentTypeRaw = sections[0].toString().toLowerCase();
  if (!contentTypeRaw.startsWith("content-type: ")) {
    throw new Error(`Failed to parse multipart request body part. Missing content type.`);
  }

  // Remove trailing '\r\n' from the last line since splitBufferByDelimiter will not with
  // maxResults set.
  const dataRaw = Buffer.from(sections[2]).slice(0, sections[2].byteLength - LINE_SEPARATOR.length);
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
  body: Buffer,
): ObjectUploadMultipartData {
  if (!contentTypeHeader.startsWith("multipart/related")) {
    throw new Error(`Bad content type. ${contentTypeHeader}`);
  }
  const boundaryId = contentTypeHeader.split("boundary=")[1];
  if (!boundaryId) {
    throw new Error(`Bad content type. ${contentTypeHeader}`);
  }
  const parsedBody = parseMultipartRequestBody(boundaryId, body);
  if (parsedBody.length !== 2) {
    throw new Error(`Unexpected number of parts in request body`);
  }
  return {
    metadataRaw: parsedBody[0].dataRaw.toString(),
    dataRaw: Buffer.from(parsedBody[1].dataRaw),
  };
}
