import * as clc from "colorette";
const Table = require("cli-table");
import * as fs from "fs";
import * as _ from "lodash";
import * as readline from "readline";

import { FirebaseError } from "./error";
import { logger } from "./logger";

const DATA_LINE_REGEX = /^data: /;

const BANDWIDTH_NOTE =
  "NOTE: The numbers reported here are only estimates of the data" +
  " payloads from read operations. They are NOT a valid measure of your bandwidth bill.";

const SPEED_NOTE =
  "NOTE: Speeds are reported at millisecond resolution and" +
  " are not the latencies that clients will see. Pending times" +
  " are also reported at millisecond resolution. They approximate" +
  " the interval of time between the instant a request is received" +
  " and the instant it executes.";

const COLLAPSE_THRESHOLD = 25;
const COLLAPSE_WILDCARD = ["$wildcard"];

// 'static' helper methods

export function extractJSON(line: string, input: any): string | null {
  if (!input && !DATA_LINE_REGEX.test(line)) {
    return null;
  } else if (!input) {
    line = line.substring(5);
  }
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}

export function pathString(path: string[]): string {
  return `/${path ? path.join("/") : ""}`;
}

export function formatNumber(num: number) {
  const parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (+parts[1] === 0) {
    return parts[0];
  }
  return parts.join(".");
}

export function formatBytes(bytes: number) {
  const threshold = 1000;
  if (Math.round(bytes) < threshold) {
    return bytes + " B";
  }
  const units = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let u = -1;
  let formattedBytes = bytes;
  do {
    formattedBytes /= threshold;
    u++;
  } while (Math.abs(formattedBytes) >= threshold && u < units.length - 1);
  return formatNumber(formattedBytes) + " " + units[u];
}

export function extractReadableIndex(query: Record<string, any>): string {
  if (query.orderBy) {
    return query.orderBy;
  }
  const indexPath: string[] = _.get(query, "index.path");
  if (indexPath) {
    return pathString(indexPath);
  }
  return ".value";
}

export interface ProfileReportOptions {
  format?: "JSON" | "RAW" | "TXT";
  isFile?: boolean;
  collapse?: boolean;
  isInput?: boolean;
}

export class ProfileReport {
  tempFile: string;
  output: NodeJS.WritableStream;
  options: ProfileReportOptions;
  private state: any;

  constructor(
    tmpFile: string,
    outStream: NodeJS.WritableStream,
    options: ProfileReportOptions = {},
  ) {
    this.tempFile = tmpFile;
    this.output = outStream;
    this.options = options;
    this.state = {
      outband: {},
      inband: {},
      writeSpeed: {},
      broadcastSpeed: {},
      readSpeed: {},
      connectSpeed: {},
      disconnectSpeed: {},
      unlistenSpeed: {},
      unindexed: {},
      startTime: 0,
      endTime: 0,
      opCount: 0,
    };
  }

  collectUnindexed(data: any, path: string) {
    if (!data.unIndexed) {
      return;
    }
    if (!this.state.unindexed.path) {
      this.state.unindexed[path] = {};
    }
    const pathNode = this.state.unindexed[path];
    // There is only ever one query.
    const query = data.querySet[0];
    // Get a unique string for this query.
    const index = JSON.stringify(query.index);
    if (!pathNode[index]) {
      pathNode[index] = {
        times: 0,
        query: query,
      };
    }
    const indexNode = pathNode[index];
    indexNode.times += 1;
  }

  collectSpeedUnpathed(data: any, opStats: any) {
    if (Object.keys(opStats).length === 0) {
      opStats.times = 0;
      opStats.millis = 0;
      opStats.pendingCount = 0;
      opStats.pendingTime = 0;
      opStats.rejected = 0;
    }
    opStats.times += 1;

    if (data.hasOwnProperty("millis")) {
      opStats.millis += data.millis;
    }
    if (data.hasOwnProperty("pendingTime")) {
      opStats.pendingCount++;
      opStats.pendingTime += data.pendingTime;
    }
    // Explictly check for false, in case its not defined.
    if (data.allowed === false) {
      opStats.rejected += 1;
    }
  }

  collectSpeed(data: any, path: string, opType: any) {
    if (!opType[path]) {
      opType[path] = {
        times: 0,
        millis: 0,
        pendingCount: 0,
        pendingTime: 0,
        rejected: 0,
      };
    }
    const node = opType[path];
    node.times += 1;
    /*
     * If `millis` is not present, we assume that the operation is fast
     * in-memory request that is not timed on the server-side (e.g.
     * connects, disconnects, listens, unlistens). Such a request may
     * have non-trivial `pendingTime`.
     */
    if (data.hasOwnProperty("millis")) {
      node.millis += data.millis;
    }
    if (data.hasOwnProperty("pendingTime")) {
      node.pendingCount++;
      node.pendingTime += data.pendingTime;
    }
    // Explictly check for false, in case its not defined.
    if (data.allowed === false) {
      node.rejected += 1;
    }
  }

  collectBandwidth(bytes: number, path: string, direction: any) {
    if (!direction[path]) {
      direction[path] = {
        times: 0,
        bytes: 0,
      };
    }
    const node = direction[path];
    node.times += 1;
    node.bytes += bytes;
  }

  collectRead(data: any, path: string, bytes: number) {
    this.collectSpeed(data, path, this.state.readSpeed);
    this.collectBandwidth(bytes, path, this.state.outband);
  }

  collectBroadcast(data: any, path: string, bytes: number) {
    this.collectSpeed(data, path, this.state.broadcastSpeed);
    this.collectBandwidth(bytes, path, this.state.outband);
  }

  collectUnlisten(data: any, path: string) {
    this.collectSpeed(data, path, this.state.unlistenSpeed);
  }

  collectConnect(data: any) {
    this.collectSpeedUnpathed(data, this.state.connectSpeed);
  }

  collectDisconnect(data: any) {
    this.collectSpeedUnpathed(data, this.state.disconnectSpeed);
  }

  collectWrite(data: any, path: string, bytes: number) {
    this.collectSpeed(data, path, this.state.writeSpeed);
    this.collectBandwidth(bytes, path, this.state.inband);
  }

  processOperation(data: any) {
    if (!this.state.startTime) {
      this.state.startTime = data.timestamp;
    }
    this.state.endTime = data.timestamp;
    const path = pathString(data.path);
    this.state.opCount++;
    switch (data.name) {
      case "concurrent-connect":
        this.collectConnect(data);
        break;
      case "concurrent-disconnect":
        this.collectDisconnect(data);
        break;
      case "realtime-read":
        this.collectRead(data, path, data.bytes);
        break;
      case "realtime-write":
        this.collectWrite(data, path, data.bytes);
        break;
      case "realtime-transaction":
        this.collectWrite(data, path, data.bytes);
        break;
      case "realtime-update":
        this.collectWrite(data, path, data.bytes);
        break;
      case "listener-listen":
        this.collectRead(data, path, data.bytes);
        this.collectUnindexed(data, path);
        break;
      case "listener-broadcast":
        this.collectBroadcast(data, path, data.bytes);
        break;
      case "listener-unlisten":
        this.collectUnlisten(data, path);
        break;
      case "rest-read":
        this.collectRead(data, path, data.bytes);
        break;
      case "rest-write":
        this.collectWrite(data, path, data.bytes);
        break;
      case "rest-update":
        this.collectWrite(data, path, data.bytes);
        break;
      default:
        break;
    }
  }

  /**
   * Takes an object with keys that are paths and combines the
   * keys that have similar prefixes.
   * Combining is done via the combiner function.
   */
  collapsePaths(pathedObject: any, combiner: any, pathIndex = 1): any {
    if (!this.options.collapse) {
      // Don't do this if the --no-collapse flag is specified
      return pathedObject;
    }
    const allSegments = Object.keys(pathedObject).map((path) => {
      return path.split("/").filter((s) => {
        return s !== "";
      });
    });
    const pathSegments = allSegments.filter((segments) => {
      return segments.length > pathIndex;
    });
    const otherSegments = allSegments.filter((segments) => {
      return segments.length <= pathIndex;
    });
    if (pathSegments.length === 0) {
      return pathedObject;
    }
    const prefixes: Record<any, any> = {};
    // Count path prefixes for the index.
    pathSegments.forEach((segments) => {
      const prefixPath = pathString(segments.slice(0, pathIndex));
      const prefixCount = _.get(prefixes, prefixPath, new Set());
      prefixes[prefixPath] = prefixCount.add(segments[pathIndex]);
    });
    const collapsedObject: Record<any, any> = {};
    pathSegments.forEach((segments) => {
      const prefix = segments.slice(0, pathIndex);
      const prefixPath = pathString(prefix);
      const prefixCount = _.get(prefixes, prefixPath);
      const originalPath = pathString(segments);
      if (prefixCount.size >= COLLAPSE_THRESHOLD) {
        const tail = segments.slice(pathIndex + 1);
        const collapsedPath = pathString(prefix.concat(COLLAPSE_WILDCARD).concat(tail));
        const currentValue = collapsedObject[collapsedPath];
        if (currentValue) {
          collapsedObject[collapsedPath] = combiner(currentValue, pathedObject[originalPath]);
        } else {
          collapsedObject[collapsedPath] = pathedObject[originalPath];
        }
      } else {
        collapsedObject[originalPath] = pathedObject[originalPath];
      }
    });
    otherSegments.forEach((segments) => {
      const originalPath = pathString(segments);
      collapsedObject[originalPath] = pathedObject[originalPath];
    });
    // Do this again, but down a level.
    return this.collapsePaths(collapsedObject, combiner, pathIndex + 1);
  }

  renderUnindexedData() {
    const table = new Table({
      head: ["Path", "Index", "Count"],
      style: {
        head: this.options.isFile ? [] : ["yellow"],
        border: this.options.isFile ? [] : ["grey"],
      },
    });
    const unindexed = this.collapsePaths(this.state.unindexed, (u1: any, u2: any) => {
      _.mergeWith(u1, u2, (p1, p2) => {
        return {
          times: p1.times + p2.times,
          query: p1.query,
        };
      });
    });
    const paths = Object.keys(unindexed);
    for (const path of paths) {
      const indices = Object.keys(unindexed[path]);
      for (const index of indices) {
        const data = unindexed[path][index];
        const row = [path, extractReadableIndex(data.query), formatNumber(data.times)];
        table.push(row);
      }
    }
    return table;
  }

  renderBandwidth(pureData: any) {
    const table = new Table({
      head: ["Path", "Total", "Count", "Average"],
      style: {
        head: this.options.isFile ? [] : ["yellow"],
        border: this.options.isFile ? [] : ["grey"],
      },
    });
    const data = this.collapsePaths(pureData, (b1: any, b2: any) => {
      return {
        bytes: b1.bytes + b2.bytes,
        times: b1.times + b2.times,
      };
    });
    const paths = Object.keys(data).sort((a: string, b: string) => {
      return data[b].bytes - data[a].bytes;
    });
    for (const path of paths) {
      const bandwidth = data[path];
      const row = [
        path,
        formatBytes(bandwidth.bytes),
        formatNumber(bandwidth.times),
        formatBytes(bandwidth.bytes / bandwidth.times),
      ];
      table.push(row);
    }
    return table;
  }

  renderOutgoingBandwidth() {
    return this.renderBandwidth(this.state.outband);
  }

  renderIncomingBandwidth() {
    return this.renderBandwidth(this.state.inband);
  }

  /*
   * Some Realtime Database operations (concurrent-connect, concurrent-disconnect)
   * are not logically associated with a path in the database. In this source
   * file, we associate these operations with the sentinel path "null" so that
   * they can still be aggregated in `collapsePaths`. So as to not confuse
   * developers, we render aggregate statistics for such operations without a
   * `path` table column.
   */
  renderUnpathedOperationSpeed(speedData: any, hasSecurity = false) {
    const head = ["Count", "Average Execution Speed", "Average Pending Time"];
    if (hasSecurity) {
      head.push("Permission Denied");
    }
    const table = new Table({
      head: head,
      style: {
        head: this.options.isFile ? [] : ["yellow"],
        border: this.options.isFile ? [] : ["grey"],
      },
    });
    /*
     * If no unpathed opeartion was seen, the corresponding stats sub-object will
     * be empty.
     */
    if (Object.keys(speedData).length > 0) {
      const row = [
        speedData.times,
        formatNumber(speedData.millis / speedData.times) + " ms",
        formatNumber(
          speedData.pendingCount === 0 ? 0 : speedData.pendingTime / speedData.pendingCount,
        ) + " ms",
      ];
      if (hasSecurity) {
        row.push(formatNumber(speedData.rejected));
      }
      table.push(row);
    }
    return table;
  }

  renderOperationSpeed(pureData: any, hasSecurity = false) {
    const head = ["Path", "Count", "Average Execution Speed", "Average Pending Time"];
    if (hasSecurity) {
      head.push("Permission Denied");
    }
    const table = new Table({
      head: head,
      style: {
        head: this.options.isFile ? [] : ["yellow"],
        border: this.options.isFile ? [] : ["grey"],
      },
    });
    const data = this.collapsePaths(pureData, (s1: any, s2: any) => {
      return {
        times: s1.times + s2.times,
        millis: s1.millis + s2.millis,
        pendingCount: s1.pendingCount + s2.pendingCount,
        pendingTime: s1.pendingTime + s2.pendingTime,
        rejected: s1.rejected + s2.rejected,
      };
    });
    const paths = Object.keys(data).sort((a, b) => {
      const speedA = data[a].millis / data[a].times;
      const speedB = data[b].millis / data[b].times;
      return speedB - speedA;
    });
    for (const path of paths) {
      const speed = data[path];
      const row = [
        path,
        speed.times,
        formatNumber(speed.millis / speed.times) + " ms",
        formatNumber(speed.pendingCount === 0 ? 0 : speed.pendingTime / speed.pendingCount) + " ms",
      ];
      if (hasSecurity) {
        row.push(formatNumber(speed.rejected));
      }
      table.push(row);
    }
    return table;
  }

  renderReadSpeed() {
    return this.renderOperationSpeed(this.state.readSpeed, true);
  }

  renderWriteSpeed() {
    return this.renderOperationSpeed(this.state.writeSpeed, true);
  }

  renderBroadcastSpeed() {
    return this.renderOperationSpeed(this.state.broadcastSpeed, false);
  }

  renderConnectSpeed() {
    return this.renderUnpathedOperationSpeed(this.state.connectSpeed, false);
  }

  renderDisconnectSpeed() {
    return this.renderUnpathedOperationSpeed(this.state.disconnectSpeed, false);
  }

  renderUnlistenSpeed() {
    return this.renderOperationSpeed(this.state.unlistenSpeed, false);
  }

  async parse(onLine: any, onClose: any): Promise<void> {
    const isFile = this.options.isFile;
    const tmpFile = this.tempFile;
    const outStream = this.output;
    const isInput = this.options.isInput;
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(tmpFile),
      });
      let errored = false;
      rl.on("line", (line) => {
        const data = extractJSON(line, isInput);
        if (!data) {
          return;
        }
        onLine(data);
      });
      rl.on("close", () => {
        if (errored) {
          reject(new FirebaseError("There was an error creating the report."));
        } else {
          const result = onClose();
          if (isFile) {
            // Only resolve once the data is flushed.
            outStream.on("finish", () => {
              resolve(result);
            });
            outStream.end();
          } else {
            resolve(result);
          }
        }
      });
      rl.on("error", () => {
        reject();
      });
      outStream.on("error", () => {
        errored = true;
        rl.close();
      });
    });
  }

  write(data: any) {
    if (this.options.isFile) {
      this.output.write(data);
    } else {
      logger.info(data);
    }
  }

  generate() {
    if (this.options.format === "TXT") {
      return this.generateText();
    } else if (this.options.format === "RAW") {
      return this.generateRaw();
    } else if (this.options.format === "JSON") {
      return this.generateJson();
    }
    throw new FirebaseError('Invalid report format expected "TXT", "JSON", or "RAW"');
  }

  generateRaw() {
    return this.parse(this.writeRaw.bind(this), () => {
      return null;
    });
  }

  writeRaw(data: any) {
    // Just write the json to the output
    this.write(JSON.stringify(data) + "\n");
  }

  generateText() {
    return this.parse(this.processOperation.bind(this), this.outputText.bind(this));
  }

  outputText() {
    const totalTime = this.state.endTime - this.state.startTime;
    const isFile = this.options.isFile;
    const write = this.write.bind(this);
    const writeTitle = (title: string) => {
      if (isFile) {
        write(title + "\n");
      } else {
        write(clc.bold(clc.yellow(title)) + "\n");
      }
    };
    const writeTable = (title: string, table: typeof Table) => {
      writeTitle(title);
      write(table.toString() + "\n");
    };
    writeTitle(
      `Report operations collected from ${new Date(
        this.state.startTime,
      ).toISOString()} over ${totalTime} ms.`,
    );
    writeTitle("Speed Report\n");
    write(SPEED_NOTE + "\n\n");
    writeTable("Read Speed", this.renderReadSpeed());
    writeTable("Write Speed", this.renderWriteSpeed());
    writeTable("Broadcast Speed", this.renderBroadcastSpeed());
    writeTable("Connect Speed", this.renderConnectSpeed());
    writeTable("Disconnect Speed", this.renderDisconnectSpeed());
    writeTable("Unlisten Speed", this.renderUnlistenSpeed());
    writeTitle("Bandwidth Report\n");
    write(BANDWIDTH_NOTE + "\n\n");
    writeTable("Downloaded Bytes", this.renderOutgoingBandwidth());
    writeTable("Uploaded Bytes", this.renderIncomingBandwidth());
    writeTable("Unindexed Queries", this.renderUnindexedData());
  }

  generateJson() {
    return this.parse(this.processOperation.bind(this), this.outputJson.bind(this));
  }

  outputJson() {
    const totalTime = this.state.endTime - this.state.startTime;
    const tableToJson = (table: any, note?: string) => {
      const json: { legend: any; data: any[]; note?: string } = {
        legend: table.options.head,
        data: [],
      };
      if (note) {
        json.note = note;
      }
      table.forEach((row: any) => {
        json.data.push(row);
      });
      return json;
    };
    const json = {
      totalTime: totalTime,
      readSpeed: tableToJson(this.renderReadSpeed(), SPEED_NOTE),
      writeSpeed: tableToJson(this.renderWriteSpeed(), SPEED_NOTE),
      broadcastSpeed: tableToJson(this.renderBroadcastSpeed(), SPEED_NOTE),
      connectSpeed: tableToJson(this.renderConnectSpeed(), SPEED_NOTE),
      disconnectSpeed: tableToJson(this.renderDisconnectSpeed(), SPEED_NOTE),
      unlistenSpeed: tableToJson(this.renderUnlistenSpeed(), SPEED_NOTE),
      downloadedBytes: tableToJson(this.renderOutgoingBandwidth(), BANDWIDTH_NOTE),
      uploadedBytes: tableToJson(this.renderIncomingBandwidth(), BANDWIDTH_NOTE),
      unindexedQueries: tableToJson(this.renderUnindexedData()),
    };
    this.write(JSON.stringify(json, null, 2));
    if (this.options.isFile) {
      return (this.output as any).path;
    }
    return json;
  }
}
