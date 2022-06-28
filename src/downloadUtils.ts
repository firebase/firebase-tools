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

import { URL } from "url";
import * as fs from "fs-extra";
import * as ProgressBar from "progress";
import * as tmp from "tmp";

import { Client } from "./apiv2";
import { FirebaseError } from "./error";

/**
 * Downloads the resource at `remoteUrl` to a temporary file.
 * Resolves to the temporary file's name, rejects if there's any error.
 * @param remoteUrl URL to download.
 */
export async function downloadToTmp(remoteUrl: string): Promise<string> {
  const u = new URL(remoteUrl);
  const c = new Client({ urlPrefix: u.origin, auth: false });
  const tmpfile = tmp.fileSync();
  const writeStream = fs.createWriteStream(tmpfile.name);

  const res = await c.request<void, NodeJS.ReadableStream>({
    method: "GET",
    path: u.pathname,
    queryParams: u.searchParams,
    responseType: "stream",
    resolveOnHTTPError: true,
  });
  if (res.status !== 200) {
    throw new FirebaseError(`download failed, status ${res.status}`, { exit: 1 });
  }

  const total = parseInt(res.response.headers.get("content-length") || "0", 10);
  const totalMb = Math.ceil(total / 1000000);
  const bar = new ProgressBar(`Progress: :bar (:percent of ${totalMb}MB)`, { total, head: ">" });

  res.body.on("data", (chunk) => {
    bar.tick(chunk.length);
  });

  await new Promise((resolve) => {
    writeStream.on("finish", resolve);
    res.body.pipe(writeStream);
  });

  return tmpfile.name;
}
