import { FirebaseError } from "../../error.js";

export default abstract class TaskError extends FirebaseError {
  constructor(taskName: string, message: string, options: object = {}) {
    super(`Task ${taskName} failed: ${message}`, options);
  }
}
