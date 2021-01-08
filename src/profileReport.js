/* eslint-disable @typescript-eslint/ban-ts-comment */
"use strict";

var clc = require("cli-color");
var Table = require("cli-table");
var fs = require("fs");
var _ = require("lodash");
var readline = require("readline");

var { FirebaseError } = require("./error");
var logger = require("./logger");

var DATA_LINE_REGEX = /^data: /;

var BANDWIDTH_NOTE =
  "NOTE: The numbers reported here are only estimates of the data" +
  " payloads from read operations. They are NOT a valid measure of your bandwidth bill.";

var SPEED_NOTE =
  "NOTE: Speeds are reported at millisecond resolution and" +
  " are not the latencies that clients will see. Pending times" +
  " are also reported at millisecond resolution. They approximate" +
  " the interval of time between the instant a request is received" +
  " and the instant it executes.";

var COLLAPSE_THRESHOLD = 25;
var COLLAPSE_WILDCARD = ["$wildcard"];

/**
 * @constructor
 * @this ProfileReport
 */
var ProfileReport = function (tmpFile, outStream, options) {
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
};

// 'static' helper methods

ProfileReport.extractJSON = function (line, input) {
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
};

ProfileReport.pathString = function (path) {
  return "/" + (path ? path.join("/") : "");
};

ProfileReport.formatNumber = function (num) {
  var parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (+parts[1] === 0) {
    return parts[0];
  }
  return parts.join(".");
};

ProfileReport.formatBytes = function (bytes) {
  var threshold = 1000;
  if (Math.round(bytes) < threshold) {
    return bytes + " B";
  }
  var units = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  var u = -1;
  var formattedBytes = bytes;
  do {
    formattedBytes /= threshold;
    u++;
  } while (Math.abs(formattedBytes) >= threshold && u < units.length - 1);
  return ProfileReport.formatNumber(formattedBytes) + " " + units[u];
};

ProfileReport.extractReadableIndex = function (query) {
  if (_.has(query, "orderBy")) {
    return query.orderBy;
  }
  var indexPath = _.get(query, "index.path");
  if (indexPath) {
    return ProfileReport.pathString(indexPath);
  }
  return ".value";
};

ProfileReport.prototype.collectUnindexed = function (data, path) {
  if (!data.unIndexed) {
    return;
  }
  if (!_.has(this.state.unindexed, path)) {
    this.state.unindexed[path] = {};
  }
  var pathNode = this.state.unindexed[path];
  // There is only ever one query.
  var query = data.querySet[0];
  // Get a unique string for this query.
  var index = JSON.stringify(query.index);
  if (!_.has(pathNode, index)) {
    pathNode[index] = {
      times: 0,
      query: query,
    };
  }
  var indexNode = pathNode[index];
  indexNode.times += 1;
};

ProfileReport.prototype.collectSpeedUnpathed = function (data, opStats) {
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
};

ProfileReport.prototype.collectSpeed = function (data, path, opType) {
  if (!_.has(opType, path)) {
    opType[path] = {
      times: 0,
      millis: 0,
      pendingCount: 0,
      pendingTime: 0,
      rejected: 0,
    };
  }
  var node = opType[path];
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
};

ProfileReport.prototype.collectBandwidth = function (bytes, path, direction) {
  if (!_.has(direction, path)) {
    direction[path] = {
      times: 0,
      bytes: 0,
    };
  }
  var node = direction[path];
  node.times += 1;
  node.bytes += bytes;
};

ProfileReport.prototype.collectRead = function (data, path, bytes) {
  this.collectSpeed(data, path, this.state.readSpeed);
  this.collectBandwidth(bytes, path, this.state.outband);
};

ProfileReport.prototype.collectBroadcast = function (data, path, bytes) {
  this.collectSpeed(data, path, this.state.broadcastSpeed);
  this.collectBandwidth(bytes, path, this.state.outband);
};

ProfileReport.prototype.collectUnlisten = function (data, path) {
  this.collectSpeed(data, path, this.state.unlistenSpeed);
};

ProfileReport.prototype.collectConnect = function (data) {
  this.collectSpeedUnpathed(data, this.state.connectSpeed);
};

ProfileReport.prototype.collectDisconnect = function (data) {
  this.collectSpeedUnpathed(data, this.state.disconnectSpeed);
};

ProfileReport.prototype.collectWrite = function (data, path, bytes) {
  this.collectSpeed(data, path, this.state.writeSpeed);
  this.collectBandwidth(bytes, path, this.state.inband);
};

ProfileReport.prototype.processOperation = function (data) {
  if (!this.state.startTime) {
    this.state.startTime = data.timestamp;
  }
  this.state.endTime = data.timestamp;
  var path = ProfileReport.pathString(data.path);
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
};

/**
 * Takes an object with keys that are paths and combines the
 * keys that have similar prefixes.
 * Combining is done via the combiner function.
 */
ProfileReport.prototype.collapsePaths = function (pathedObject, combiner, pathIndex) {
  if (!this.options.collapse) {
    // Don't do this if the --no-collapse flag is specified
    return pathedObject;
  }
  if (_.isUndefined(pathIndex)) {
    pathIndex = 1;
  }
  var allSegments = _.keys(pathedObject).map(function (path) {
    return path.split("/").filter(function (s) {
      return s !== "";
    });
  });
  var pathSegments = allSegments.filter(function (segments) {
    return segments.length > pathIndex;
  });
  var otherSegments = allSegments.filter(function (segments) {
    return segments.length <= pathIndex;
  });
  if (pathSegments.length === 0) {
    return pathedObject;
  }
  var prefixes = {};
  // Count path prefixes for the index.
  pathSegments.forEach(function (segments) {
    var prefixPath = ProfileReport.pathString(segments.slice(0, pathIndex));
    var prefixCount = _.get(prefixes, prefixPath, new Set());
    prefixes[prefixPath] = prefixCount.add(segments[pathIndex]);
  });
  var collapsedObject = {};
  pathSegments.forEach(function (segments) {
    var prefix = segments.slice(0, pathIndex);
    var prefixPath = ProfileReport.pathString(prefix);
    var prefixCount = _.get(prefixes, prefixPath);
    var originalPath = ProfileReport.pathString(segments);
    if (prefixCount.size >= COLLAPSE_THRESHOLD) {
      var tail = segments.slice(pathIndex + 1);
      var collapsedPath = ProfileReport.pathString(prefix.concat(COLLAPSE_WILDCARD).concat(tail));
      var currentValue = collapsedObject[collapsedPath];
      if (currentValue) {
        collapsedObject[collapsedPath] = combiner(currentValue, pathedObject[originalPath]);
      } else {
        collapsedObject[collapsedPath] = pathedObject[originalPath];
      }
    } else {
      collapsedObject[originalPath] = pathedObject[originalPath];
    }
  });
  otherSegments.forEach(function (segments) {
    var originalPath = ProfileReport.pathString(segments);
    collapsedObject[originalPath] = pathedObject[originalPath];
  });
  // Do this again, but down a level.
  return this.collapsePaths(collapsedObject, combiner, pathIndex + 1);
};

ProfileReport.prototype.renderUnindexedData = function () {
  var table = new Table({
    head: ["Path", "Index", "Count"],
    style: {
      head: this.options.isFile ? [] : ["yellow"],
      border: this.options.isFile ? [] : ["grey"],
    },
  });
  var unindexed = this.collapsePaths(this.state.unindexed, function (u1, u2) {
    _.mergeWith(u1, u2, function (p1, p2) {
      return {
        times: p1.times + p2.times,
        query: p1.query,
      };
    });
  });
  var paths = _.keys(unindexed);
  paths.forEach(function (path) {
    var indices = _.keys(unindexed[path]);
    indices.forEach(function (index) {
      var data = unindexed[path][index];
      var row = [
        path,
        ProfileReport.extractReadableIndex(data.query),
        ProfileReport.formatNumber(data.times),
      ];
      table.push(row);
    });
  });
  return table;
};

ProfileReport.prototype.renderBandwidth = function (pureData) {
  var table = new Table({
    head: ["Path", "Total", "Count", "Average"],
    style: {
      head: this.options.isFile ? [] : ["yellow"],
      border: this.options.isFile ? [] : ["grey"],
    },
  });
  var data = this.collapsePaths(pureData, function (b1, b2) {
    return {
      bytes: b1.bytes + b2.bytes,
      times: b1.times + b2.times,
    };
  });
  var paths = _.keys(data);
  paths = _.orderBy(
    paths,
    function (path) {
      var bandwidth = data[path];
      return bandwidth.bytes;
    },
    ["desc"]
  );
  paths.forEach(function (path) {
    var bandwidth = data[path];
    var row = [
      path,
      ProfileReport.formatBytes(bandwidth.bytes),
      ProfileReport.formatNumber(bandwidth.times),
      ProfileReport.formatBytes(bandwidth.bytes / bandwidth.times),
    ];
    table.push(row);
  });
  return table;
};

ProfileReport.prototype.renderOutgoingBandwidth = function () {
  return this.renderBandwidth(this.state.outband);
};

ProfileReport.prototype.renderIncomingBandwidth = function () {
  return this.renderBandwidth(this.state.inband);
};

/*
 * Some Realtime Database operations (concurrent-connect, concurrent-disconnect)
 * are not logically associated with a path in the database. In this source
 * file, we associate these operations with the sentinel path "null" so that
 * they can still be aggregated in `collapsePaths`. So as to not confuse
 * developers, we render aggregate statistics for such operations without a
 * `path` table column.
 */
ProfileReport.prototype.renderUnpathedOperationSpeed = function (speedData, hasSecurity) {
  var head = ["Count", "Average Execution Speed", "Average Pending Time"];
  if (hasSecurity) {
    head.push("Permission Denied");
  }
  var table = new Table({
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
    var row = [
      speedData.times,
      ProfileReport.formatNumber(speedData.millis / speedData.times) + " ms",
      ProfileReport.formatNumber(
        speedData.pendingCount === 0 ? 0 : speedData.pendingTime / speedData.pendingCount
      ) + " ms",
    ];
    if (hasSecurity) {
      row.push(ProfileReport.formatNumber(speedData.rejected));
    }
    table.push(row);
  }
  return table;
};

ProfileReport.prototype.renderOperationSpeed = function (pureData, hasSecurity) {
  var head = ["Path", "Count", "Average Execution Speed", "Average Pending Time"];
  if (hasSecurity) {
    head.push("Permission Denied");
  }
  var table = new Table({
    head: head,
    style: {
      head: this.options.isFile ? [] : ["yellow"],
      border: this.options.isFile ? [] : ["grey"],
    },
  });
  var data = this.collapsePaths(pureData, function (s1, s2) {
    return {
      times: s1.times + s2.times,
      millis: s1.millis + s2.millis,
      pendingCount: s1.pendingCount + s2.pendingCount,
      pendingTime: s1.pendingTime + s2.pendingTime,
      rejected: s1.rejected + s2.rejected,
    };
  });
  var paths = _.keys(data);
  paths = _.orderBy(
    paths,
    function (path) {
      var speed = data[path];
      return speed.millis / speed.times;
    },
    ["desc"]
  );
  paths.forEach(function (path) {
    var speed = data[path];
    var row = [
      path,
      speed.times,
      ProfileReport.formatNumber(speed.millis / speed.times) + " ms",
      ProfileReport.formatNumber(
        speed.pendingCount === 0 ? 0 : speed.pendingTime / speed.pendingCount
      ) + " ms",
    ];
    if (hasSecurity) {
      row.push(ProfileReport.formatNumber(speed.rejected));
    }
    table.push(row);
  });
  return table;
};

ProfileReport.prototype.renderReadSpeed = function () {
  return this.renderOperationSpeed(this.state.readSpeed, true);
};

ProfileReport.prototype.renderWriteSpeed = function () {
  return this.renderOperationSpeed(this.state.writeSpeed, true);
};

ProfileReport.prototype.renderBroadcastSpeed = function () {
  return this.renderOperationSpeed(this.state.broadcastSpeed, false);
};

ProfileReport.prototype.renderConnectSpeed = function () {
  return this.renderUnpathedOperationSpeed(this.state.connectSpeed, false);
};

ProfileReport.prototype.renderDisconnectSpeed = function () {
  return this.renderUnpathedOperationSpeed(this.state.disconnectSpeed, false);
};

ProfileReport.prototype.renderUnlistenSpeed = function () {
  return this.renderOperationSpeed(this.state.unlistenSpeed, false);
};

ProfileReport.prototype.parse = function (onLine, onClose) {
  var isFile = this.options.isFile;
  var tmpFile = this.tempFile;
  var outStream = this.output;
  var isInput = this.options.isInput;
  return new Promise(function (resolve, reject) {
    var rl = readline.createInterface({
      input: fs.createReadStream(tmpFile),
    });
    var errored = false;
    rl.on("line", function (line) {
      var data = ProfileReport.extractJSON(line, isInput);
      if (!data) {
        return;
      }
      onLine(data);
    });
    rl.on("close", function () {
      if (errored) {
        reject(new FirebaseError("There was an error creating the report."));
      } else {
        var result = onClose();
        if (isFile) {
          // Only resolve once the data is flushed.
          outStream.on("finish", function () {
            resolve(result);
          });
          outStream.end();
        } else {
          resolve(result);
        }
      }
    });
    rl.on("error", function () {
      reject();
    });
    outStream.on("error", function () {
      errored = true;
      rl.close();
    });
  });
};

ProfileReport.prototype.write = function (data) {
  if (this.options.isFile) {
    this.output.write(data);
  } else {
    logger.info(data);
  }
};

ProfileReport.prototype.generate = function () {
  if (this.options.format === "TXT") {
    return this.generateText();
  } else if (this.options.format === "RAW") {
    return this.generateRaw();
  } else if (this.options.format === "JSON") {
    return this.generateJson();
  }
  throw new FirebaseError('Invalid report format expected "TXT", "JSON", or "RAW"', {
    exit: 1,
  });
};

ProfileReport.prototype.generateRaw = function () {
  return this.parse(this.writeRaw.bind(this), function () {
    return null;
  });
};

ProfileReport.prototype.writeRaw = function (data) {
  // Just write the json to the output
  this.write(JSON.stringify(data) + "\n");
};

ProfileReport.prototype.generateText = function () {
  return this.parse(this.processOperation.bind(this), this.outputText.bind(this));
};

ProfileReport.prototype.outputText = function () {
  var totalTime = this.state.endTime - this.state.startTime;
  var isFile = this.options.isFile;
  var write = this.write.bind(this);
  var writeTitle = function (title) {
    if (isFile) {
      write(title + "\n");
    } else {
      write(clc.bold.yellow(title) + "\n");
    }
  };
  var writeTable = function (title, table) {
    writeTitle(title);
    write(table.toString() + "\n");
  };
  writeTitle(
    "Report operations collected from " +
      new Date(this.state.startTime).toISOString() +
      " over " +
      totalTime +
      " ms."
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
};

ProfileReport.prototype.generateJson = function () {
  return this.parse(this.processOperation.bind(this), this.outputJson.bind(this));
};

ProfileReport.prototype.outputJson = function () {
  var totalTime = this.state.endTime - this.state.startTime;
  var tableToJson = function (table, note) {
    var json = {
      legend: table.options.head,
      data: [],
    };
    if (note) {
      json.note = note;
    }
    table.forEach(function (row) {
      // @ts-ignore
      json.data.push(row);
    });
    return json;
  };
  var json = {
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
    return this.output.path;
  }
  return json;
};

module.exports = ProfileReport;
