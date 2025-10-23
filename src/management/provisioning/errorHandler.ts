import { FirebaseError, getError } from "../../error";

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
 * Extracts detailed error information from a provisioning API error response.
 * Returns a formatted string with error details and help links.
 */
function extractErrorDetails(err: unknown): string {
  if (!(err instanceof Error)) {
    return "";
  }

  // Check if this is a FirebaseError with context containing provisioning error
  if (err instanceof FirebaseError && err.context) {
    const context = err.context as { body?: ProvisioningError };
    const errorBody = context.body?.error;

    if (errorBody?.details && Array.isArray(errorBody.details)) {
      const parts: string[] = [];

      for (const detail of errorBody.details) {
        if (isErrorInfo(detail)) {
          parts.push(`Error details:`);
          parts.push(`  Reason: ${detail.reason}`);
          parts.push(`  Domain: ${detail.domain}`);
          if (detail.metadata) {
            parts.push(`  Additional Info: ${JSON.stringify(detail.metadata)}`);
          }
        } else if (isHelpLinks(detail)) {
          parts.push(`\nFor help resolving this issue:`);
          for (const link of detail.links) {
            parts.push(`  - ${link.description}`);
            parts.push(`    ${link.url}`);
          }
        }
      }

      return parts.length > 0 ? `\n\n${parts.join("\n")}` : "";
    }
  }

  return "";
}

/**
 * Enhances an error with detailed information from provisioning API responses.
 * This function extracts error details and includes them in the error message.
 */
export function enhanceProvisioningError(err: unknown, contextMessage: string): FirebaseError {
  const originalError = getError(err);
  const errorDetails = extractErrorDetails(err);

  const fullMessage = errorDetails
    ? `${contextMessage}: ${originalError.message}${errorDetails}`
    : `${contextMessage}: ${originalError.message}`;

  return new FirebaseError(fullMessage, {
    exit: 2,
    original: originalError,
  });
}
