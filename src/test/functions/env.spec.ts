import { expect } from "chai";

import * as env from "../../functions/env";

describe("parse", () => {
  it("parses values with trailing spaces", () => {
    expect(env.parse("FOO=foo    ")).to.deep.equal({ envs: { FOO: "foo" }, errors: [] });
    expect(env.parse("FOO='foo'    ")).to.deep.equal({ envs: { FOO: "foo" }, errors: [] });
    expect(env.parse('FOO="foo"    ')).to.deep.equal({ envs: { FOO: "foo" }, errors: [] });
  });

  it("parses double quoted, multi-line values", () => {
    expect(env.parse('FOO="foo1\\nfoo2"\nBAR=bar')).to.deep.equal({
      envs: { FOO: "foo1\nfoo2", BAR: "bar" },
      errors: [],
    });
    expect(
      env.parse(`
FOO="foo1
foo2"
BAR=bar
`)
    ).to.deep.equal({ envs: { FOO: "foo1\nfoo2", BAR: "bar" }, errors: [] });
  });

  it("parses double quoted values with escape characters", () => {
    expect(env.parse('FOO="foo1\\"foo2"')).to.deep.equal({
      envs: { FOO: 'foo1"foo2' },
      errors: [],
    });
  });

  it("parses unquoted/ single quoted values with escape characters", () => {
    expect(env.parse("FOO=foo1\\'foo2")).to.deep.equal({
      envs: { FOO: "foo1\\'foo2" },
      errors: [],
    });
    expect(env.parse("FOO='foo1\\'foo2'")).to.deep.equal({
      envs: { FOO: "foo1\\'foo2" },
      errors: [],
    });
  });

  it("parses empty value", () => {
    expect(env.parse("FOO=")).to.deep.equal({
      envs: { FOO: "" },
      errors: [],
    });
  });

  it("parses keys with leading spaces", () => {
    expect(env.parse("        FOO=foo        ")).to.deep.equal({
      envs: { FOO: "foo" },
      errors: [],
    });
  });

  it("parses values with trailing spaces", () => {
    expect(env.parse("FOO=foo        ")).to.deep.equal({
      envs: { FOO: "foo" },
      errors: [],
    });
    expect(env.parse("FOO='foo '        ")).to.deep.equal({
      envs: { FOO: "foo " },
      errors: [],
    });
    expect(env.parse('FOO="foo "        ')).to.deep.equal({
      envs: { FOO: "foo " },
      errors: [],
    });
  });

  it("parses unquoted values with #", () => {
    expect(env.parse("FOO=foo#bar")).to.deep.equal({
      envs: { FOO: "foo" },
      errors: [],
    });
  });

  it("parses quoted values with #", () => {
    expect(env.parse("FOO='foo#bar'")).to.deep.equal({
      envs: { FOO: "foo#bar" },
      errors: [],
    });
    expect(env.parse('FOO="foo#bar"')).to.deep.equal({
      envs: { FOO: "foo#bar" },
      errors: [],
    });
  });

  it("ignores leading/trailing spaces before the separator", () => {
    expect(env.parse("FOO   =      foo")).to.deep.equal({
      envs: { FOO: "foo" },
      errors: [],
    });
    expect(env.parse('FOO   =  "foo"')).to.deep.equal({
      envs: { FOO: "foo" },
      errors: [],
    });
    expect(env.parse("FOO   =  'foo'")).to.deep.equal({
      envs: { FOO: "foo" },
      errors: [],
    });
  });

  it("ignores comments", () => {
    expect(
      env.parse(`
FOO=foo # comment
# line comment 1
# line comment 2
BAR=bar # another comment
`)
    ).to.deep.equal({
      envs: { FOO: "foo", BAR: "bar" },
      errors: [],
    });
  });

  it("ignores empty lines", () => {
    expect(
      env.parse(`
FOO=foo


BAR=bar

`)
    ).to.deep.equal({
      envs: { FOO: "foo", BAR: "bar" },
      errors: [],
    });
  });

  it("catches invalid lines", () => {
    expect(
      env.parse(`
BAR###
FOO=foo
// not a comment
=missing key
`)
    ).to.deep.equal({
      envs: { FOO: "foo" },
      errors: ["BAR###", "// not a comment", "=missing key"],
    });
  });
});
