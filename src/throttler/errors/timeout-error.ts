import TaskError from "./task-error.js";

export default class TimeoutError extends TaskError {
  constructor(taskName: string, timeout: number) {
    super(taskName, `timed out after ${timeout}ms.`);
  }
}
