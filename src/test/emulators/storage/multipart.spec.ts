import { expect } from "chai";
import { parseObjectUploadMultipartRequest } from "../../../emulator/storage/multipart";

describe("parseMultipartRequest", () => {
  const CONTENT_TYPE_HEADER = "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e";
  const BODY = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
Content-Type: application/json\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
Content-Type: text/plain\r
\r
hello there!
\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);

  it("parses an upload object multipart request successfully", () => {
    const { metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, BODY);

    expect(metadataRaw).to.equal('{"contentType":"text/plain"}');
    expect(dataRaw.toString()).to.equal("hello there!\n");
  });

  it("fails to parse with invalid Content-Type value", () => {
    const invalidContentTypeHeader = "blah";
    expect(() => parseObjectUploadMultipartRequest(invalidContentTypeHeader, BODY)).to.throw(
      "Invalid Content-Type"
    );
  });

  it("fails to parse with invalid boundary value", () => {
    const invalidContentTypeHeader = "multipart/related; boundary=";
    expect(() => parseObjectUploadMultipartRequest(invalidContentTypeHeader, BODY)).to.throw(
      "Invalid Content-Type"
    );
  });

  it("fails to parse when body has wrong number of parts", () => {
    const invalidBody = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
Content-Type: application/json\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);
    expect(() => parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, invalidBody)).to.throw(
      "Unexpected number of parts"
    );
  });

  it("fails to parse when body part has invalid content type", () => {
    const invalidBody = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
bogus content type\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
bogus content type\r
\r
hello there!
\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);
    expect(() => parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, invalidBody)).to.throw(
      "Missing content type."
    );
  });

  it("fails to parse when body part is malformed", () => {
    const invalidBody = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);
    expect(() => parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, invalidBody)).to.throw(
      "Failed to parse multipart request body part"
    );
  });
});
