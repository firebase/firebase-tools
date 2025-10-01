import { FirebaseError } from "../../../error";

export function formatLoggingError(err: unknown): string {
  const base = "Failed to retrieve Cloud Logging entries.";
  if (err instanceof FirebaseError) {
    const original = err.original as any;
    const statusCode = original?.context?.response?.statusCode;
    const statusReason = original?.context?.body?.error?.status;
    const statusMessage = original?.context?.body?.error?.message;

    const parts: string[] = [base];
    const statusBits: string[] = [];
    if (statusCode) statusBits.push(`HTTP ${statusCode}`);
    if (statusReason) statusBits.push(statusReason);
    if (statusBits.length) parts[0] = `${base} (${statusBits.join(" ")})`;

    if (statusMessage && statusMessage !== err.message) {
      parts.push(statusMessage);
    }

    if (statusCode === 403 || statusCode === 401) {
      parts.push(
        "Ensure the active account has logging.logEntries.list access and the Cloud Logging API is enabled for the project.",
      );
    }
    if (statusCode === 404) {
      parts.push("Verify the project ID is correct and that the function has deployed logs.");
    }
    return parts.join(" ");
  }
  if (err instanceof Error) {
    return `${base} ${err.message}`;
  }
  return base;
}
