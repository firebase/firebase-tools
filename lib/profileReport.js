'use strict';

var chalk = require('chalk');
var Table = require('cli-table');
var Set = require('es6-set');
var fs = require('fs');
var _ = require('lodash');
var readline = require('readline');
var RSVP = require('rsvp');

var FirebaseError = require('./error');
var logger = require('./logger');
var utils = require('./utils');

var DATA_LINE_REGEX = /^data: /;

var BANDWIDTH_NOTE = 'NOTE: Bandwidth is an estimate and' +
' not a valid measure of your bandwidth bill.';

var SPEED_NOTE = 'NOTE: Speeds are reported at millisecond resolution and' +
' are not the latencies that clients will see.';

var COLLAPSE_THRESHOLD = 25;
var COLLAPSE_WILDCARD = ['$wildcard'];

function extractJSON(line, input) {
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

function pathString(path) {
  if (path) {
    return '/' + path.join('/');
  }
  return null;
}

function collectUnindexed(data, path, unindexed) {
  if (!data.unIndexed) {
    return;
  }
  if (!_.has(unindexed, path)) {
    unindexed[path] = {};
  }
  var pathNode = unindexed[path];
  // There is only ever one query.
  var query = data.querySet[0];
  // Get a unique string for this query.
  var index = JSON.stringify(query.index);
  if (!_.has(pathNode, index)) {
    pathNode[index] = {
      times: 0,
      query: query
    };
  }
  var indexNode = pathNode[index];
  indexNode.times += 1;
}

function collectSpeed(data, path, opType) {
  if (!_.has(opType, path)) {
    opType[path] = {
      times: 0,
      millis: 0,
      rejected: 0
    };
  }
  var node = opType[path];
  node.times += 1;
  node.millis += data.millis;
  // Explictly check for false, in case its not defined.
  if (data.allowed === false) {
    node.rejected += 1;
  }
}

function collectBandwidth(bytes, path, direction) {
  if (!_.has(direction, path)) {
    direction[path] = {
      times: 0,
      bytes: 0
    };
  }
  var node = direction[path];
  node.times += 1;
  node.bytes += bytes;
}

function collect(data, path, bytes, speed, direction) {
  collectSpeed(data, path, speed);
  collectBandwidth(bytes, path, direction);
}

function processOperation(data, state) {
  var path = pathString(data.path);
  state.opCount++;
  switch (data.name) {
  case 'concurrent-connect':
    break;
  case 'concurrent-disconnect':
    break;
  case 'realtime-read':
    collect(data, path, data.bytes, state.readSpeed, state.outband);
    break;
  case 'realtime-write':
    collect(data, path, data.bytes, state.writeSpeed, state.inband);
    break;
  case 'realtime-transaction':
    collect(data, path, data.bytes, state.writeSpeed, state.inband);
    break;
  case 'realtime-update':
    collect(data, path, data.bytes, state.writeSpeed, state.inband);
    break;
  case 'listener-listen':
    collect(data, path, data.bytes, state.readSpeed, state.outband);
    collectUnindexed(data, path, state.unindexed);
    break;
  case 'listener-broadcast':
    collect(data, path, data.bytes, state.broadcastSpeed, state.outband);
    break;
  case 'listener-unlisten':
    break;
  case 'rest-read':
    collect(data, path, data.bytes, state.readSpeed, state.outband);
    break;
  case 'rest-write':
    collect(data, path, data.bytes, state.writeSpeed, state.inband);
    break;
  case 'rest-update':
    collect(data, path, data.bytes, state.writeSpeed, state.inband);
    break;
  default:
    break;
  }
}

function formatNumber(num) {
  var parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (+parts[1] === 0) {
    return parts[0];
  }
  return parts.join('.');
}

function formatBytes(bytes) {
  var threshold = 1000;
  if (Math.round(bytes) < threshold) {
    return bytes + ' B';
  }
  var units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  var u = -1;
  var formattedBytes = bytes;
  do {
    formattedBytes /= threshold;
    u++;
  } while (Math.abs(formattedBytes) >= threshold && u < units.length - 1);
  return formatNumber(formattedBytes) + ' ' + units[u];
}

/**
 * Takes an object with keys that are paths and combines the
 * keys that have similar prefixes.
 * Combining is done via the combiner function.
 */
function collapsePaths(pathedObject, combiner, pathIndex) {
  if (_.isUndefined(pathIndex)) {
    pathIndex = 1;
  }
  var allSegments = _.keys(pathedObject).map(function(path) {
    return path.split('/').filter(function(s) {
      return s !== '';
    });
  });
  var pathSegments = allSegments.filter(function(segments) {
    return segments.length > pathIndex;
  });
  var otherSegments = allSegments.filter(function(segments) {
    return segments.length <= pathIndex;
  });
  if (pathSegments.length === 0) {
    return pathedObject;
  }
  var prefixes = {};
  // Count path prefixes for the index.
  pathSegments.forEach(function(segments) {
    var prefixPath = pathString(segments.slice(0, pathIndex));
    var prefixCount = _.get(prefixes, prefixPath, new Set());
    prefixes[prefixPath] = prefixCount.add(segments[pathIndex]);
  });
  var collapsedObject = {};
  pathSegments.forEach(function(segments) {
    var prefix = segments.slice(0, pathIndex);
    var prefixPath = pathString(prefix);
    var prefixCount = _.get(prefixes, prefixPath);
    var originalPath = pathString(segments);
    if (prefixCount.size >= COLLAPSE_THRESHOLD) {
      var tail = segments.slice(pathIndex + 1);
      var collapsedPath = pathString(prefix.concat(COLLAPSE_WILDCARD).concat(tail));
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
  otherSegments.forEach(function(segments) {
    var originalPath = pathString(segments);
    collapsedObject[originalPath] = pathedObject[originalPath];
  });
  // Do this again, but down a level.
  return collapsePaths(collapsedObject, combiner, pathIndex + 1);
}

function extractReadableIndex(query) {
  var indexPath = _.get(query, 'index.path');
  if (indexPath) {
    return pathString(indexPath);
  }
  return '.value';
}

function renderUnindexedData(state, style) {
  var table = new Table({
    head: ['Path', 'Index', 'Count'],
    style: {
      head: style ? ['yellow'] : [],
      border: style ? ['grey'] : []
    }
  });
  var unindexed = collapsePaths(state.unindexed, function(u1, u2) {
    _.mergeWith(u1, u2, function(p1, p2) {
      return {
        times: p1.times + p2.times,
        query: p1.query
      };
    });
  });
  var paths = _.keys(unindexed);
  paths.forEach(function(path) {
    var indices = _.keys(unindexed[path]);
    indices.forEach(function(index) {
      var data = unindexed[path][index];
      var row = [
        path,
        extractReadableIndex(data.query),
        formatNumber(data.times)
      ];
      table.push(row);
    });
  });
  return table;
}

function renderBandwidth(pureData, style) {
  var table = new Table({
    head: ['Path', 'Total', 'Count', 'Average'],
    style: {
      head: style ? ['yellow'] : [],
      border: style ? ['grey'] : []
    }
  });
  var data = collapsePaths(pureData, function(b1, b2) {
    return {
      bytes: b1.bytes + b2.bytes,
      times: b1.times + b2.times
    };
  });
  var paths = _.keys(data);
  paths = _.orderBy(paths, function(path) {
    var bandwidth = data[path];
    return bandwidth.bytes;
  }, ['desc']);
  paths.forEach(function(path) {
    var bandwidth = data[path];
    var row = [
      path,
      formatBytes(bandwidth.bytes),
      formatNumber(bandwidth.times),
      formatBytes(bandwidth.bytes / bandwidth.times)
    ];
    table.push(row);
  });
  return table;
}

function renderOutgoingBandwidth(state, style) {
  return renderBandwidth(state.outband, style);
}

function renderIncomingBandwidth(state, style) {
  return renderBandwidth(state.inband, style);
}

function renderOperationSpeed(pureData, style, hasSecurity) {
  var head = ['Path', 'Count', 'Average'];
  if (hasSecurity) {
    head.push('Permission Denied');
  }
  var table = new Table({
    head: head,
    style: {
      head: style ? ['yellow'] : [],
      border: style ? ['grey'] : []
    }
  });
  var data = collapsePaths(pureData, function(s1, s2) {
    return {
      times: s1.times + s2.times,
      millis: s1.millis + s2.millis,
      rejected: s1.rejected + s2.rejected
    };
  });
  var paths = _.keys(data);
  paths = _.orderBy(paths, function(path) {
    var speed = data[path];
    return speed.millis / speed.times;
  }, ['desc']);
  paths.forEach(function(path) {
    var speed = data[path];
    var row = [
      path,
      speed.times,
      formatNumber(speed.millis / speed.times) + ' ms'
    ];
    if (hasSecurity) {
      row.push(formatNumber(speed.rejected));
    }
    table.push(row);
  });
  return table;
}

function renderWriteSpeed(state, style) {
  return renderOperationSpeed(state.writeSpeed, style, true);
}

function renderReadSpeed(state, style) {
  return renderOperationSpeed(state.readSpeed, style, true);
}

function renderBroadcastSpeed(state, style) {
  return renderOperationSpeed(state.broadcastSpeed, style, false);
}

function reporter(tmpFile, outStream, options, onLine, onClose) {
  var isFile = options.isFile;
  return new RSVP.Promise(function(resolve, reject) {
    var rl = readline.createInterface({
      input: fs.createReadStream(tmpFile)
    });
    var errored = false;
    rl.on('line', function(line) {
      var data = extractJSON(line, options.isInput);
      if (!data) {
        return;
      }
      onLine(data);
    });
    rl.on('close', function() {
      if (errored) {
        reject(new FirebaseError('There was an error creating the report.'));
      } else {
        var result = onClose();
        if (isFile) {
          // Only resolve once the data is flushed.
          outStream.on('finish', function() {
            resolve(result);
          });
          outStream.end();
        } else {
          resolve(result);
        }
      }
    });
    rl.on('error', function() {
      reject();
    });
    outStream.on('error', function() {
      errored = true;
      rl.close();
    });
  });
}

var generateReport = function(tmpFile, outStream, options) {
  var isFile = options.isFile;
  var write = function(data) {
    if (isFile) {
      outStream.write(data);
    } else {
      logger.info(data);
    }
  };
  if (options.format === 'TXT' || options.format === 'JSON') {
    var state = {
      outband: {},
      inband: {},
      writeSpeed: {},
      broadcastSpeed: {},
      readSpeed: {},
      unindexed: {},
      startTime: 0,
      endTime: 0,
      opCount: 0
    };
    return reporter(tmpFile, outStream, options, function(data) {
      if (!state.startTime) {
        state.startTime = data.timestamp;
      }
      state.endTime = data.timestamp;
      processOperation(data, state);
    }, function() {
      var totalTime = state.endTime - state.startTime;
      if (options.format === 'JSON') {
        var tableToJson = function(table, note) {
          var json = {
            legend: table.options.head,
            data: []
          };
          if (note) {
            json.note = note;
          }
          table.forEach(function(row) {
            json.data.push(row);
          });
          return json;
        };
        var json = {
          totalTime: totalTime,
          readSpeed: tableToJson(renderReadSpeed(state, !isFile), SPEED_NOTE),
          writeSpeed: tableToJson(renderWriteSpeed(state, !isFile), SPEED_NOTE),
          broadcastSpeed: tableToJson(renderBroadcastSpeed(state, !isFile), SPEED_NOTE),
          downloadedBytes: tableToJson(renderOutgoingBandwidth(state, !isFile), BANDWIDTH_NOTE),
          uploadedBytes: tableToJson(renderIncomingBandwidth(state, !isFile), BANDWIDTH_NOTE),
          unindexedQueries: tableToJson(renderUnindexedData(state, !isFile))
        };
        write(JSON.stringify(json, null, 2));
        if (isFile) {
          return outStream.path;
        }
        return json;
      }
      var writeTitle = function(title) {
        if (isFile) {
          write(title + '\n');
        } else {
          write(chalk.bold.yellow(title) + '\n');
        }
      };
      var writeTable = function(title, table) {
        writeTitle(title);
        write(table.toString() + '\n');
      };
      writeTitle('Report operations collected over ' + totalTime + ' ms.');
      writeTitle('Speed Report\n');
      write(SPEED_NOTE + '\n\n');
      writeTable('Read Speed', renderReadSpeed(state, !isFile));
      writeTable('Write Speed', renderWriteSpeed(state, !isFile));
      writeTable('Broadcast Speed', renderBroadcastSpeed(state, !isFile));
      writeTitle('Bandwidth Report\n');
      write(BANDWIDTH_NOTE + '\n\n');
      writeTable('Downloaded Bytes', renderOutgoingBandwidth(state, !isFile));
      writeTable('Uploaded Bytes', renderIncomingBandwidth(state, !isFile));
      writeTable('Unindexed Queries', renderUnindexedData(state, !isFile));
    });
  } else if (options.format === 'RAW') {
    return reporter(tmpFile, outStream, options, function(data) {
      // Just write the json to the output
      write(JSON.stringify(data) + '\n');
    }, function() {
      return null;
    });
  }
  return utils.reject(new FirebaseError('Invalid report format expected "TXT", "JSON", or "RAW"', {
    exit: 1
  }));
};

generateReport.BANDWIDTH_NOTE = BANDWIDTH_NOTE;
generateReport.SPEED_NOTE = SPEED_NOTE;
generateReport.helpers = {
  collapsePaths: collapsePaths,
  extractReadableIndex: extractReadableIndex,
  formatNumber: formatNumber
};

module.exports = generateReport;
