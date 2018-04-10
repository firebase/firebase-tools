"use strict";

var chai = require("chai");
var expect = chai.expect;

var path = require("path");

var listFiles = require("../../lib/listFiles");

describe("listFiles", function() {
  // for details, see the file structure and firebase.json in test/fixtures/ignores
  it("should ignore firebase-debug.log, specified ignores, and nothing else", function() {
    expect(
      listFiles(path.resolve(__dirname, "../fixtures/ignores"), [
        "**/.*",
        "firebase.json",
        "ignored.txt",
        "ignored/**/*.txt",
      ])
    ).to.deep.equal(["index.html", "ignored/index.html", "present/index.html"]);
  });
});
