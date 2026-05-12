import { expect } from "chai";
import {
  parseObjectUploadMultipartRequest,
  parseFormDataMultipartRequest,
  MultipartFile,
  MultipartField,
} from "./multipart";
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

  describe("#parseFormDataMultipartRequest()", () => {
    const boundary = "b1d5b2e3-1845-4338-9400-6ac07ce53c1e";
    const CONTENT_TYPE_HEADER = `multipart/form-data; boundary=${boundary}`;

    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const imageContent = Buffer.concat([pngSignature, randomBytes(100)]);
    const startBuffer = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="key"\r
\r
path/image.png\r
--${boundary}\r
Content-Disposition: form-data; name="content-type"\r
\r
image/png\r
--${boundary}\r
Content-Disposition: form-data; name="x-goog-meta-color"\r
\r
blue\r
--${boundary}\r
Content-Disposition: form-data; name="file"; filename="image.png"\r
Content-Type: image/png\r
\r
`);
    const endBuffer = Buffer.from(`\r
--${boundary}--\r
`);
    const BODY = Buffer.concat([startBuffer, imageContent, endBuffer]);

    it("parses a form data multipart request with file and fields successfully", () => {
      const parts = parseFormDataMultipartRequest(CONTENT_TYPE_HEADER, BODY);

      expect(parts.length).to.equal(4);

      const keyPart = parts.find((p) => p.name === "key") as MultipartField;
      expect(keyPart.value).to.equal("path/image.png");

      const contentTypePart = parts.find((p) => p.name === "content-type") as MultipartField;
      expect(contentTypePart.value).to.equal("image/png");

      const metadataPart = parts.find((p) => p.name === "x-goog-meta-color") as MultipartField;
      expect(metadataPart.value).to.equal("blue");

      const filePart = parts.find((p) => p.name === "file") as MultipartFile;
      expect(filePart.filename).to.equal("image.png");
      expect(filePart.contentType).to.equal("image/png");
      expect(filePart.data.byteLength).to.equal(imageContent.byteLength);
    });

    it("fails to parse a form data multipart request when file part is missing name", () => {
      const invalidBody = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="key"\r
\r
path/image.png\r
--${boundary}\r
Content-Disposition: form-data; filename="image.png"\r
Content-Type: image/png\r
\r
hello there!\r
--${boundary}--\r
`);

      expect(() => parseFormDataMultipartRequest(CONTENT_TYPE_HEADER, invalidBody)).to.throw(
        "Missing 'name' in Content-Disposition header.",
      );
    });

    it("fails to parse a form data multipart request when part body is missing trailing line separator", () => {
      const invalidStartBuffer = Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="key"\r
\r
path/image.png\r
--${boundary}\r
Content-Disposition: form-data; name="file"; filename="image.png"\r
Content-Type: image/png\r
\r
`);
      const invalidEndBuffer = Buffer.from(`--${boundary}--\r
`);
      const invalidBody = Buffer.concat([invalidStartBuffer, imageContent, invalidEndBuffer]);

      expect(() => parseFormDataMultipartRequest(CONTENT_TYPE_HEADER, invalidBody)).to.throw(
        "Missing trailing line separator.",
      );
    });
  });
});
