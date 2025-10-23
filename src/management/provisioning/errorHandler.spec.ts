import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { logProvisioningError, enhanceProvisioningError } from "./errorHandler";

describe("errorHandler", () => {
  let sandbox: sinon.SinonSandbox;
  let loggerErrorStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    loggerErrorStub = sandbox.stub(logger, "error");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("logProvisioningError", () => {
    it("should not log anything for non-Error types", () => {
      logProvisioningError("simple string error");
      logProvisioningError(null);
      logProvisioningError(undefined);
      logProvisioningError(123);

      expect(loggerErrorStub.called).to.be.false;
    });

    it("should not log anything for regular Error without context", () => {
      const regularError = new Error("Regular error message");

      logProvisioningError(regularError);

      expect(loggerErrorStub.called).to.be.false;
    });

    it("should not log anything for FirebaseError without error details", () => {
      const fbError = new FirebaseError("Firebase error without details", {
        context: {
          body: {
            error: {
              code: 400,
              message: "Bad Request",
              status: "INVALID_ARGUMENT",
            },
          },
        },
      });

      logProvisioningError(fbError);

      expect(loggerErrorStub.called).to.be.false;
    });

    it("should log ErrorInfo details when present", () => {
      const fbError = new FirebaseError("TOS required", {
        context: {
          body: {
            error: {
              code: 403,
              message: "The user has not accepted the terms of service.",
              status: "PERMISSION_DENIED",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                  reason:
                    "TOS_REQUIRED: The following ToS's must be accepted: [generative-language-api].",
                  domain: "firebase.googleapis.com",
                },
              ],
            },
          },
        },
      });

      logProvisioningError(fbError);

      expect(loggerErrorStub.callCount).to.be.greaterThan(0);
      expect(loggerErrorStub.calledWith("")).to.be.true;
      expect(loggerErrorStub.calledWith("Error details:")).to.be.true;
      expect(
        loggerErrorStub.calledWith(
          "  Reason: TOS_REQUIRED: The following ToS's must be accepted: [generative-language-api].",
        ),
      ).to.be.true;
      expect(loggerErrorStub.calledWith("  Domain: firebase.googleapis.com")).to.be.true;
    });

    it("should log HelpLinks when present", () => {
      const fbError = new FirebaseError("TOS required", {
        context: {
          body: {
            error: {
              code: 403,
              message: "The user has not accepted the terms of service.",
              status: "PERMISSION_DENIED",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.Help",
                  links: [
                    {
                      description: "Link to accept Generative Language terms of service",
                      url: "https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?authuser=0&forceCheckTos=true",
                    },
                  ],
                },
              ],
            },
          },
        },
      });

      logProvisioningError(fbError);

      expect(loggerErrorStub.calledWith("For help resolving this issue:")).to.be.true;
      expect(loggerErrorStub.calledWith("  - Link to accept Generative Language terms of service"))
        .to.be.true;
      expect(
        loggerErrorStub.calledWith(
          "    https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?authuser=0&forceCheckTos=true",
        ),
      ).to.be.true;
    });

    it("should log multiple ErrorInfo and HelpLinks together", () => {
      const fbError = new FirebaseError("TOS required", {
        context: {
          body: {
            error: {
              code: 403,
              message: "The user has not accepted the terms of service.",
              status: "PERMISSION_DENIED",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                  reason:
                    "TOS_REQUIRED: The following ToS's must be accepted: [generative-language-api].",
                  domain: "firebase.googleapis.com",
                },
                {
                  "@type": "type.googleapis.com/google.rpc.Help",
                  links: [
                    {
                      description: "Link to accept Generative Language terms of service",
                      url: "https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?authuser=0&forceCheckTos=true",
                    },
                  ],
                },
              ],
            },
          },
        },
      });

      logProvisioningError(fbError);

      // Verify ErrorInfo is logged
      expect(
        loggerErrorStub.calledWith(
          "  Reason: TOS_REQUIRED: The following ToS's must be accepted: [generative-language-api].",
        ),
      ).to.be.true;
      expect(loggerErrorStub.calledWith("  Domain: firebase.googleapis.com")).to.be.true;

      // Verify HelpLinks are logged
      expect(loggerErrorStub.calledWith("For help resolving this issue:")).to.be.true;
      expect(loggerErrorStub.calledWith("  - Link to accept Generative Language terms of service"))
        .to.be.true;
    });

    it("should log ErrorInfo with metadata when present", () => {
      const fbError = new FirebaseError("Error with metadata", {
        context: {
          body: {
            error: {
              code: 400,
              message: "Invalid request",
              status: "INVALID_ARGUMENT",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                  reason: "INVALID_FIELD",
                  domain: "firebase.googleapis.com",
                  metadata: {
                    field: "displayName",
                    constraint: "max_length",
                  },
                },
              ],
            },
          },
        },
      });

      logProvisioningError(fbError);

      expect(loggerErrorStub.calledWith("  Reason: INVALID_FIELD")).to.be.true;
      expect(loggerErrorStub.calledWith("  Domain: firebase.googleapis.com")).to.be.true;
      expect(
        loggerErrorStub.calledWith(
          sinon.match(
            (value: string) => value.includes("Additional Info") && value.includes("field"),
          ),
        ),
      ).to.be.true;
    });

    it("should handle multiple help links", () => {
      const fbError = new FirebaseError("Multiple help links", {
        context: {
          body: {
            error: {
              code: 403,
              message: "Permission denied",
              status: "PERMISSION_DENIED",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.Help",
                  links: [
                    {
                      description: "First help link",
                      url: "https://example.com/help1",
                    },
                    {
                      description: "Second help link",
                      url: "https://example.com/help2",
                    },
                  ],
                },
              ],
            },
          },
        },
      });

      logProvisioningError(fbError);

      expect(loggerErrorStub.calledWith("  - First help link")).to.be.true;
      expect(loggerErrorStub.calledWith("    https://example.com/help1")).to.be.true;
      expect(loggerErrorStub.calledWith("  - Second help link")).to.be.true;
      expect(loggerErrorStub.calledWith("    https://example.com/help2")).to.be.true;
    });

    it("should ignore unknown detail types", () => {
      const fbError = new FirebaseError("Unknown detail type", {
        context: {
          body: {
            error: {
              code: 500,
              message: "Internal error",
              status: "INTERNAL",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.UnknownType",
                  someField: "someValue",
                },
              ],
            },
          },
        },
      });

      logProvisioningError(fbError);

      // Should still log the header
      expect(loggerErrorStub.calledWith("Error details:")).to.be.true;
      // But should not log any specific details for unknown types
      expect(loggerErrorStub.calledWith(sinon.match(/Reason/))).to.be.false;
      expect(loggerErrorStub.calledWith(sinon.match(/For help/))).to.be.false;
    });
  });

  describe("enhanceProvisioningError", () => {
    it("should log details and return FirebaseError with context message", () => {
      const originalError = new FirebaseError("Original error", {
        context: {
          body: {
            error: {
              code: 403,
              message: "Permission denied",
              status: "PERMISSION_DENIED",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                  reason: "TOS_REQUIRED",
                  domain: "firebase.googleapis.com",
                },
              ],
            },
          },
        },
      });

      const result = enhanceProvisioningError(originalError, "Failed to provision Firebase app");

      // Verify logging occurred
      expect(loggerErrorStub.called).to.be.true;

      // Verify returned error
      expect(result).to.be.instanceOf(FirebaseError);
      expect(result.message).to.equal("Failed to provision Firebase app: Original error");
      expect(result.exit).to.equal(2);
      expect(result.original).to.equal(originalError);
    });

    it("should handle non-Error types gracefully", () => {
      const result = enhanceProvisioningError("String error", "Operation failed");

      expect(result).to.be.instanceOf(FirebaseError);
      expect(result.message).to.equal("Operation failed: String error");
      expect(result.exit).to.equal(2);
      expect(result.original).to.be.instanceOf(Error);
    });

    it("should handle regular Error without context", () => {
      const regularError = new Error("Regular error");

      const result = enhanceProvisioningError(regularError, "Context message");

      expect(result).to.be.instanceOf(FirebaseError);
      expect(result.message).to.equal("Context message: Regular error");
      expect(result.original).to.equal(regularError);
    });
  });
});
