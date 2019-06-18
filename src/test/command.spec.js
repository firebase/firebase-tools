"use strict";

var chai = require("chai");
var expect = chai.expect;

var Command = require("../command");

describe("Command", function() {
  var command;

  beforeEach(function() {
    command = new Command("example");
  });

  it("should initialize the name from the argument", function() {
    expect(new Command("test")._name).to.equal("test");
  });

  it("should set description with a command", function() {
    expect(command.description("test")._description).to.equal("test");
  });

  it("should add an option with a command", function() {
    expect(
      command.option("-f", "first option").option("-s", "second option")._options
    ).to.have.length(2);
  });

  it("should add a before with a command", function() {
    expect(command.before(function() {}).before(function() {})._befores).to.have.length(2);
  });

  it("should set the action with a command", function() {
    var action = function() {};
    expect(command.action(action)._action).to.equal(action);
  });

  describe(".runner()", function() {
    it("should work when no arguments are passed and options", function() {
      var run = command
        .action(function(options) {
          options.foo = "bar";
          return Promise.resolve(options);
        })
        .runner();

      return expect(run({ foo: "baz" })).to.eventually.have.property("foo", "bar");
    });

    it("should execute befores before the action", function() {
      var run = command
        .before(function(options) {
          options.foo = true;
          return Promise.resolve();
        })
        .action(function(options) {
          if (options.foo) {
            options.bar = "baz";
          }
          return options;
        })
        .runner();

      return expect(run({})).to.eventually.have.property("bar");
    });

    it("should terminate execution if a before errors", function() {
      var run = command
        .before(function() {
          throw new Error("foo");
        })
        .action(function(options, resolve) {
          resolve(true);
        })
        .runner();

      return expect(run()).to.be.rejectedWith("foo");
    });

    it("should reject the promise if an error is thrown", function() {
      var run = command
        .action(function() {
          throw new Error("foo");
        })
        .runner();

      return expect(run()).to.be.rejectedWith("foo");
    });
  });
});
