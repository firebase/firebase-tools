import { expect } from "chai";
import { parseObjectUploadMultipartRequest } from "../../../emulator/storage/multipart";
import { randomBytes } from "crypto";

describe("Storage Multipart Request Parser", () => {
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

  describe("#parseObjectUploadMultipartRequest()", () => {
    it("parses an upload object multipart request successfully", () => {
      const { metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, BODY);

      expect(metadataRaw).to.equal('{"contentType":"text/plain"}');
      expect(dataRaw.toString()).to.equal("hello there!\n");
    });

    it("parses an upload object multipart request with non utf-8 data successfully", () => {
      const bodyPart1 = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
Content-Type: application/json\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
Content-Type: text/plain\r
\r
`);
      const data = Buffer.concat(
        [Buffer.from(randomBytes(100)), Buffer.from("\r\n"), Buffer.from(randomBytes(100))],
        202,
      );
      const bodyPart2 = Buffer.from(`\r\n--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r\n`);
      const body = Buffer.concat([bodyPart1, data, bodyPart2]);

      const { dataRaw } = parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, body);

      expect(dataRaw.byteLength).to.equal(data.byteLength);
    });

    it("parses an upload object multipart request with lowercase content-type", () => {
      const body = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
content-type: application/json\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
content-type: text/plain\r
\r
hello there!
\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);

      const { metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, body);

      expect(metadataRaw).to.equal('{"contentType":"text/plain"}');
      expect(dataRaw.toString()).to.equal("hello there!\n");
    });

    it("fails to parse with invalid Content-Type value", () => {
      const invalidContentTypeHeader = "blah";
      expect(() => parseObjectUploadMultipartRequest(invalidContentTypeHeader, BODY)).to.throw(
        "Bad content type.",
      );
    });

    it("fails to parse with invalid boundary value", () => {
      const invalidContentTypeHeader = "multipart/related; boundary=";
      expect(() => parseObjectUploadMultipartRequest(invalidContentTypeHeader, BODY)).to.throw(
        "Bad content type.",
      );
    });

    it("parses an upload object multipart request with additional quotes in the boundary value", () => {
      const contentTypeHeaderWithDoubleQuotes = `multipart/related; boundary="b1d5b2e3-1845-4338-9400-6ac07ce53c1e"`;

      let { metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(
        contentTypeHeaderWithDoubleQuotes,
        BODY,
      );

      expect(metadataRaw).to.equal('{"contentType":"text/plain"}');
      expect(dataRaw.toString()).to.equal("hello there!\n");

      const contentTypeHeaderWithSingleQuotes = `multipart/related; boundary='b1d5b2e3-1845-4338-9400-6ac07ce53c1e'`;

      ({ metadataRaw, dataRaw } = parseObjectUploadMultipartRequest(
        contentTypeHeaderWithSingleQuotes,
        BODY,
      ));

      expect(metadataRaw).to.equal('{"contentType":"text/plain"}');
      expect(dataRaw.toString()).to.equal("hello there!\n");
    });

    it("fails to parse when body has wrong number of parts", () => {
      const invalidBody = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
Content-Type: application/json\r
\r
{"contentType":"text/plain"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);
      expect(() => parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, invalidBody)).to.throw(
        "Unexpected number of parts",
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
        "Missing content type.",
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
        "Failed to parse multipart request body part",
      );
    });
  });
});
