import { FirebaseError } from "../../error";
import { logger } from "../../logger";

/**
 * Google RPC ErrorInfo structure
 */
interface ErrorInfo {
  "@type": "type.googleapis.com/google.rpc.ErrorInfo";
  reason: string;
  domain: string;
  metadata?: Record<string, string>;
}

/**
 * Google RPC Help structure with links
 */
interface HelpLinks {
  "@type": "type.googleapis.com/google.rpc.Help";
  links: Array<{
    description: string;
    url: string;
  }>;
}

/**
 * Error detail can be ErrorInfo, HelpLinks, or other types
 */
type ErrorDetail = ErrorInfo | HelpLinks | Record<string, unknown>;

/**
 * Provisioning API error structure
 */
interface ProvisioningError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: ErrorDetail[];
  };
}

/**
 * Type guard for ErrorInfo
 */
function isErrorInfo(detail: ErrorDetail): detail is ErrorInfo {
  return detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo";
}

/**
 * Type guard for HelpLinks
 */
function isHelpLinks(detail: ErrorDetail): detail is HelpLinks {
  return detail["@type"] === "type.googleapis.com/google.rpc.Help";
}

/**
 * Logs detailed error information from a provisioning API error response.
 * Extracts and displays error details and help links.
 */
export function logProvisioningError(err: unknown): void {
  if (!(err instanceof Error)) {
    return;
  }

  // Check if this is a FirebaseError with context containing provisioning error
  if (err instanceof FirebaseError && err.context) {
    const context = err.context as { body?: ProvisioningError };
    const errorBody = context.body?.error;

    if (errorBody?.details && Array.isArray(errorBody.details)) {
      logger.error("");
      logger.error("Error details:");

      for (const detail of errorBody.details) {
        if (isErrorInfo(detail)) {
          logger.error(`  Reason: ${detail.reason}`);
          logger.error(`  Domain: ${detail.domain}`);
          if (detail.metadata) {
            logger.error(`  Additional Info: ${JSON.stringify(detail.metadata, null, 2)}`);
          }
        } else if (isHelpLinks(detail)) {
          logger.error("");
          logger.error("For help resolving this issue:");
          for (const link of detail.links) {
            logger.error(`  - ${link.description}`);
            logger.error(`    ${link.url}`);
          }
        }
      }
      logger.error("");
    }
  }
}

/**
 * Enhances an error with detailed logging from provisioning API responses.
 * This function logs detailed error information and returns a user-friendly FirebaseError.
 */
export function enhanceProvisioningError(err: unknown, contextMessage: string): FirebaseError {
  // Log detailed error information first
  logProvisioningError(err);

  // Create and return a user-friendly error
  const errorMessage = err instanceof Error ? err.message : String(err);
  return new FirebaseError(`${contextMessage}: ${errorMessage}`, {
    exit: 2,
    original: err instanceof Error ? err : new Error(String(err)),
  });
}
