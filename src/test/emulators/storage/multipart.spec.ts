/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
        202
      );
      const bodyPart2 = Buffer.from(`\r\n--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r\n`);
      const body = Buffer.concat([bodyPart1, data, bodyPart2]);

      const { dataRaw } = parseObjectUploadMultipartRequest(CONTENT_TYPE_HEADER, body);

      expect(dataRaw.byteLength).to.equal(data.byteLength);
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
});
