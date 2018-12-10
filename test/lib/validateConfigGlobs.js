"use strict";

var chai = require("chai");
var expect = chai.expect;
var validateConfigGlobs = require("../../lib/deploy/hosting/validateConfigGlobs");

function warningShown(glob) {
  var cfg = { rewrites: [{ source: glob }] };
  return validateConfigGlobs(cfg).length > 0;
}

describe("glob validation", function() {
  it("should not fire on a normal glob", function() {
    expect(warningShown("/foo/bar")).to.be.false;
  });

  it("should not fire on the empty string", function() {
    expect(warningShown("")).to.be.false;
  });

  it("should detect multiple slashes", function() {
    expect(warningShown("foo//bar")).to.be.true;
  });

  it("should detect exploding globstars", function() {
    expect(warningShown("/a/**/b/**/c/**/d/**")).to.be.true;
    expect(warningShown("/**/**/**/**")).to.be.true;
  });

  it("should detect overly long globs", function() {
    // eslint-disable-next-line
    expect(
      warningShown(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).to.be.true;
  });

  it("should interpret length limits in terms of codepoints instead of bytes", function() {
    // eslint-disable-next-line
    expect(
      warningShown(
        "ああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああ"
      )
    ).to.be.false;
  });

  it("should allow most L-category UTF-8 characters", function() {
    expect(warningShown("utf8/あ")).to.be.false;
    expect(warningShown("capture/:あ")).to.be.false;
    expect(warningShown("astral/🤔")).to.be.false;
  });

  it("should detect malformed extglobs", function() {
    expect(warningShown("@(abc)")).to.be.false;
    expect(warningShown("@(abc")).to.be.true;
    expect(warningShown("@(abc!(def)")).to.be.true;
    expect(warningShown("abc)")).to.be.true;
    expect(warningShown("@(abc[)]")).to.be.true;
  });

  it("should detect malformed literal classes", function() {
    expect(warningShown("[abc]")).to.be.false;
    expect(warningShown("[abc")).to.be.true;
    expect(warningShown("[abc@(])")).to.be.true;
    expect(warningShown("abc]")).to.be.true;
  });

  it("should detect '/' inside of an extglob", function() {
    expect(warningShown("!(foo/bar)")).to.be.true;
  });

  it("should detect bash numerical sequence expansions", function() {
    expect(warningShown("{0..99}")).to.be.true;
  });

  it("should detect captures with illegal characters", function() {
    expect(warningShown("/:abc@def")).to.be.true;
  });

  it("should detect captures with special characters", function() {
    expect(warningShown("/:abc?q=d")).to.be.true;
  });

  it("should detect captures beginning in the middle of a segment", function() {
    expect(warningShown("/abc:def")).to.be.true;
  });
});
