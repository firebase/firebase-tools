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

import { logger } from "../logger";
import { LogEntry } from "../gcp/cloudlogging";

/**
 * The correct API filter to use when GCFv2 is enabled and/or we want specific function logs
 * @param functionList list of functions seperated by comma
 * @return the correct filter for use when calling the list api
 */
export function getApiFilter(functionList?: string) {
  const baseFilter =
    'resource.type="cloud_function" OR ' +
    '(resource.type="cloud_run_revision" AND ' +
    'labels."goog-managed-by"="cloudfunctions")';

  if (functionList) {
    const apiFuncFilters = functionList.split(",").map((fn) => {
      return `resource.labels.function_name="${fn}" ` + `OR resource.labels.service_name="${fn}"`;
    });
    return baseFilter + `\n(${apiFuncFilters.join(" OR ")})`;
  }

  return baseFilter;
}

/**
 * Logs all entires with info severity to the CLI
 * @param entries a list of {@link LogEntry}
 */
export function logEntries(entries: LogEntry[]): void {
  if (!entries || entries.length === 0) {
    logger.info("No log entries found.");
    return;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const timestamp = entry.timestamp || "---";
    const severity = (entry.severity || "?").substring(0, 1);
    const name = entry.resource.labels.function_name || entry.resource.labels.service_name;
    const message =
      entry.textPayload ||
      JSON.stringify(entry.jsonPayload) ||
      JSON.stringify(entry.protoPayload) ||
      "";

    logger.info(`${timestamp} ${severity} ${name}: ${message}`);
  }
}
