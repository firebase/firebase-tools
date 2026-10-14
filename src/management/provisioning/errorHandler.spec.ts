import { expect } from "chai";
import { FirebaseError } from "../../error";
import { enhanceProvisioningError } from "./errorHandler";

describe("errorHandler", () => {
  describe("enhanceProvisioningError", () => {
    it("should include ErrorInfo details in error message", () => {
      const originalError = new FirebaseError("Permission denied", {
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

      const result = enhanceProvisioningError(originalError, "Failed to provision Firebase app");

      expect(result).to.be.instanceOf(FirebaseError);
      expect(result.message).to.include("Failed to provision Firebase app: Permission denied");
      expect(result.message).to.include("Error details:");
      expect(result.message).to.include(
        "Reason: TOS_REQUIRED: The following ToS's must be accepted: [generative-language-api].",
      );
      expect(result.message).to.include("Domain: firebase.googleapis.com");
      expect(result.exit).to.equal(2);
      expect(result.original).to.equal(originalError);
    });

    it("should include HelpLinks in error message", () => {
      const originalError = new FirebaseError("Permission denied", {
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

      const result = enhanceProvisioningError(originalError, "Failed to provision Firebase app");

      expect(result.message).to.include("For help resolving this issue:");
      expect(result.message).to.include("Link to accept Generative Language terms of service");
      expect(result.message).to.include(
        "https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?authuser=0&forceCheckTos=true",
      );
    });

    it("should include both ErrorInfo and HelpLinks in error message", () => {
      const originalError = new FirebaseError("Permission denied", {
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

      const result = enhanceProvisioningError(originalError, "Failed to provision Firebase app");

      // Verify ErrorInfo is included
      expect(result.message).to.include("Error details:");
      expect(result.message).to.include(
        "Reason: TOS_REQUIRED: The following ToS's must be accepted: [generative-language-api].",
      );
      expect(result.message).to.include("Domain: firebase.googleapis.com");

      // Verify HelpLinks are included
      expect(result.message).to.include("For help resolving this issue:");
      expect(result.message).to.include("Link to accept Generative Language terms of service");
    });

    it("should include ErrorInfo with metadata in error message", () => {
      const originalError = new FirebaseError("Invalid request", {
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

      const result = enhanceProvisioningError(originalError, "Operation failed");

      expect(result.message).to.include("Reason: INVALID_FIELD");
      expect(result.message).to.include("Domain: firebase.googleapis.com");
      expect(result.message).to.include("Additional Info:");
      expect(result.message).to.include("field");
    });

    it("should include multiple help links in error message", () => {
      const originalError = new FirebaseError("Multiple help links", {
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

      const result = enhanceProvisioningError(originalError, "Operation failed");

      expect(result.message).to.include("First help link");
      expect(result.message).to.include("https://example.com/help1");
      expect(result.message).to.include("Second help link");
      expect(result.message).to.include("https://example.com/help2");
    });

    it("should handle errors without details gracefully", () => {
      const originalError = new FirebaseError("Firebase error without details", {
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

      const result = enhanceProvisioningError(originalError, "Operation failed");

      expect(result).to.be.instanceOf(FirebaseError);
      expect(result.message).to.equal("Operation failed: Firebase error without details");
      expect(result.exit).to.equal(2);
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

    it("should ignore unknown detail types", () => {
      const originalError = new FirebaseError("Unknown detail type", {
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

      const result = enhanceProvisioningError(originalError, "Operation failed");

      expect(result.message).to.equal("Operation failed: Unknown detail type");
      expect(result.message).to.not.include("Error details:");
      expect(result.message).to.not.include("For help");
    });
  });
});
