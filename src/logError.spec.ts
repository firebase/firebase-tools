import { expect } from "chai";
import * as sinon from "sinon";
import { logError } from "./logError";
import { logger } from "./logger";

describe("logError", () => {
  let sandbox: sinon.SinonSandbox;
  let errorSpy: sinon.SinonSpy;
  let debugSpy: sinon.SinonSpy;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    errorSpy = sandbox.spy(logger, "error");
    debugSpy = sandbox.spy(logger, "debug");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should log a simple error message", () => {
    const error = { message: "A simple error has occurred." };
    logError(error);
    expect(errorSpy).to.have.been.calledWith(sinon.match.any, "A simple error has occurred.");
  });

  it("should log an error with children", () => {
    const error = {
      message: "An error with children has occurred.",
      children: [{ name: "Child1", message: "Child error 1" }, { message: "Child error 2" }],
    };
    logError(error);
    expect(errorSpy).to.have.been.calledWith(
      sinon.match.any,
      sinon.match(/An error with children has occurred./),
    );
    expect(errorSpy).to.have.been.calledWith(sinon.match(/- .*Child1.* Child error 1/));
    expect(errorSpy).to.have.been.calledWith(sinon.match(/- Child error 2/));
  });

  it("should log an error with an original stack", () => {
    const error = {
      message: "An error with an original stack.",
      original: { stack: "the stack" },
    };
    logError(error);
    expect(debugSpy).to.have.been.calledWith("the stack");
  });

  it("should log an error with a context", () => {
    const error = {
      message: "An error with a context.",
      context: { key: "value" },
    };
    logError(error);
    expect(debugSpy).to.have.been.calledWith(
      "Error Context:",
      JSON.stringify({ key: "value" }, undefined, 2),
    );
  });

  it("should log an error with both original stack and context", () => {
    const error = {
      message: "An error with both.",
      original: { stack: "the stack" },
      context: { key: "value" },
    };
    logError(error);
    expect(debugSpy).to.have.been.calledWith("the stack");
    expect(debugSpy).to.have.been.calledWith(
      "Error Context:",
      JSON.stringify({ key: "value" }, undefined, 2),
    );
  });

  it("should log an error with children and context", () => {
    const error = {
      message: "An error with children and context.",
      children: [{ message: "Child error" }],
      context: { key: "value" },
    };
    logError(error);
    expect(errorSpy).to.have.been.calledWith(
      sinon.match.any,
      sinon.match(/An error with children and context./),
    );
    expect(errorSpy).to.have.been.calledWith(sinon.match(/- Child error/));
    expect(debugSpy).to.have.been.calledWith(
      "Error Context:",
      JSON.stringify({ key: "value" }, undefined, 2),
    );
  });
});
