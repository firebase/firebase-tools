import { Options } from "../../options";
import * as args from "./args";

export async function release(
  context: any, // TODO: type this
  options: Options,
  payload: args.Payload,
) {
  /**
   * Outline:
   *
   * Set up some queues
   * Enqueue tasks to make real calls.
   * Report errors at the end.
   */
}
