import { Options } from "../../options";
import { Payload } from "./args";

export async function release(
  context: any, // TODO: type this
  options: Options,
  payload: Payload
) {
  /**
   * Outline:
   *
   * Set up some queues
   * Enqueue tasks to make real calls.
   * Report errors at the end.
   */
}
