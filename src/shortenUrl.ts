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

import { logger } from "./logger";
import { Client } from "./apiv2";
import { dynamicLinksKey, dynamicLinksOrigin } from "./api";

const DYNAMIC_LINKS_PREFIX = "https://firebase.tools/l";

const apiClient = new Client({
  urlPrefix: dynamicLinksOrigin,
  auth: false,
  apiVersion: "v1",
});

interface DynamicLinksRequest {
  dynamicLinkInfo: {
    link: string;
    domainUriPrefix: string;
  };
  suffix: { option: "SHORT" | "UNGUESSABLE" };
}

interface DynamicLinksResponse {
  shortLink: string;
  previewLink: string;
}

/**
 * Attempts to shorten a URL for easier display in terminals. Falls back to returning the original URL if anything goes wrong.
 *
 * @param url The URL to shorten.
 * @param guessable When true, a shorter suffix (~4 characters) is used instead of an unguessable one. Do not set to true when URL contains personally identifiable information.
 * @return The short URL or the original URL if an error occurs.
 */
export async function shortenUrl(url: string, guessable = false): Promise<string> {
  try {
    const response = await apiClient.post<DynamicLinksRequest, DynamicLinksResponse>(
      `shortLinks?key=${dynamicLinksKey}`,
      {
        dynamicLinkInfo: {
          link: url,
          domainUriPrefix: DYNAMIC_LINKS_PREFIX,
        },
        suffix: { option: guessable ? "SHORT" : "UNGUESSABLE" },
      }
    );

    return response.body.shortLink;
  } catch (e: any) {
    logger.debug("URL shortening failed, falling back to full URL. Error:", e.original || e);
    return url;
  }
}
