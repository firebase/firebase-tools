import TaskError from "./task-error";

export default class RetriesExhaustedError extends TaskError {
  constructor(taskName: string, totalRetries: number, lastTrialError: Error) {
    super(
      taskName,
      `retries exhausted after ${totalRetries + 1} attempts, with error: ${lastTrialError.message}`,
      {
        original: lastTrialError,
      },
    );
  }
}
