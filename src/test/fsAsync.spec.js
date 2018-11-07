"use strict";

var crypto = require("crypto");
var fs = require("fs");
var os = require("os");
var path = require("path");

var fsAsync = require("../fsAsync");

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var _ = require("lodash");

var expect = chai.expect;
chai.use(chaiAsPromised);

// These tests work on the following directory structure:
// <basedir>
//   .hidden
//   visible
//   subdir/
//     subfile
//       nesteddir/
//         nestedfile
//       node_modules/
//         nestednodemodules
//   node_modules
//     subfile
describe("fsAsync", function() {
  var baseDir;
  var files = [
    ".hidden",
    "visible",
    "subdir/subfile",
    "subdir/nesteddir/nestedfile",
    "subdir/node_modules/nestednodemodules",
    "node_modules/subfile",
  ];

  before(function() {
    baseDir = path.join(os.tmpdir(), crypto.randomBytes(10).toString("hex"));
    fs.mkdirSync(baseDir);
    fs.mkdirSync(path.join(baseDir, "subdir"));
    fs.mkdirSync(path.join(baseDir, "subdir", "nesteddir"));
    fs.mkdirSync(path.join(baseDir, "subdir", "node_modules"));
    fs.mkdirSync(path.join(baseDir, "node_modules"));
    _.each(files, function(file) {
      fs.writeFileSync(path.join(baseDir, file), file);
    });
  });

  after(function() {
    return fsAsync.rmdirRecursive(baseDir).then(function() {
      return expect(fsAsync.stat(baseDir)).to.be.rejected;
    });
  });

  it("can recurse directories", function() {
    var foundFiles = fsAsync.readdirRecursive({ path: baseDir }).then(function(results) {
      return _.map(results, function(result) {
        return result.name;
      }).sort();
    });
    var expectFiles = _.map(files, function(file) {
      return path.join(baseDir, file);
    }).sort();
    return expect(foundFiles).to.eventually.deep.equal(expectFiles);
  });

  it("can ignore directories", function() {
    var expected = _.chain(files)
      .reject(function(file) {
        return file.indexOf("node_modules") !== -1;
      })
      .map(function(file) {
        return path.join(baseDir, file);
      })
      .value()
      .sort();

    var promise = fsAsync
      .readdirRecursive({
        path: baseDir,
        ignore: ["node_modules"],
      })
      .then(function(results) {
        return _.map(results, function(result) {
          return result.name;
        }).sort();
      });

    return expect(promise).to.eventually.deep.equal(expected);
  });

  it("supports blob rules", function() {
    var expected = _.chain(files)
      .reject(function(file) {
        return file.indexOf("node_modules") !== -1;
      })
      .map(function(file) {
        return path.join(baseDir, file);
      })
      .value()
      .sort();

    var promise = fsAsync
      .readdirRecursive({
        path: baseDir,
        ignore: ["**/node_modules/**"],
      })
      .then(function(results) {
        return _.map(results, function(result) {
          return result.name;
        }).sort();
      });

    return expect(promise).to.eventually.deep.equal(expected);
  });

  it("should support negation rules", function() {
    var expected = _.chain(files)
      .filter(function(file) {
        return file === "visible";
      })
      .map(function(file) {
        return path.join(baseDir, file);
      })
      .value()
      .sort();

    var promise = fsAsync
      .readdirRecursive({
        path: baseDir,
        ignore: ["!visible"],
      })
      .then(function(results) {
        return _.map(results, function(result) {
          return result.name;
        }).sort();
      });

    return expect(promise).to.eventually.deep.equal(expected);
  });
});
