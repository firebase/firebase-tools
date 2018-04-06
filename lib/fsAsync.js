'use strict';

var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var RSVP = require('rsvp');

// resolver creates a promise resolver for an errback
function resolver(resolve, reject) {
  return function(err, result) {
    if (err) {
      return reject(err);
    }
    resolve(result);
  };
}

function readdir(location) {
  return new RSVP.Promise(function(resolve, reject) {
    var done = resolver(resolve, reject);
    // In earlier versions of Node, fs.readdir was a two param function;
    // later versions of Node introduced an options parameter in between
    // the path and callback.
    if (fs.readdir.length === 2) {
      fs.readdir(location, done);
    } else {
      fs.readdir(location, {encoding: 'utf8'}, done);
    }
  });
}

function stat(location) {
  return new RSVP.Promise(function(resolve, reject) {
    fs.stat(location, resolver(resolve, reject));
  });
}

function unlink(location) {
  return new RSVP.Promise(function(resolve, reject) {
    fs.unlink(location, resolver(resolve, reject));
  });
}

function rmdir(location) {
  return new RSVP.Promise(function(resolve, reject) {
    return fs.rmdir(location, resolver(resolve, reject));
  });
}

// Options contains a path and optionally files to ignore.
// @param options.path the directory to recurse
// @param options.ignore files to ignore
// @returns array of {name, mode} for files that match
function readdirRecursive(options) {
  return readdir(options.path).then(function(dirContents) {
    var work = _
      .chain(dirContents)
      .reject(function(file) { return _.includes(options.ignore, file); })
      .map(function(file) {
        var fullFile = path.join(options.path, file);
        return stat(fullFile).then(function(fstat) {
          if (fstat.isFile()) {
            return {
              name: fullFile,
              mode: fstat.mode
            };
          }
          if (!fstat.isDirectory()) {
            return null;
          }
          return readdirRecursive({
            path: fullFile,
            ignore: options.ignore
          });
        });
      })
      .value();

    // Note: we cannot flatten in the chain because we have an array of Promises
    // which might themselves resolve into an array.
    return RSVP.Promise.all(work).then(_.flatten);
  }).then(function(results) {
    // Special files were returned as null; cut them from results.
    return _.reject(results, _.isNull);
  });
}

function rmdirRecursive(location) {
  return readdir(location).then(function(dirContents) {
    var cleanThisDir = RSVP.Promise.all(_.map(dirContents, function(file) {
      file = path.join(location, file);
      return stat(file).then(function(fstat) {
        if (fstat.isDirectory()) {
          return rmdirRecursive(file);
        }
        return unlink(file);
      });
    }));
    return cleanThisDir.then(function() {
      return rmdir(location);
    });
  });
}

module.exports = {
  readdir: readdir,
  rmdir: rmdir,
  stat: stat,
  unlink: unlink,
  readdirRecursive: readdirRecursive,
  rmdirRecursive: rmdirRecursive
};
