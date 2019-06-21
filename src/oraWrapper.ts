import * as ora from "ora";

/**
 * A wrapper class for ora library in order to provide mocking ability in unit tests
 */
export class OraWrapper {
  private ora: ora.Ora;

  constructor(options?: string | ora.Options) {
    this.ora = ora(options);
  }

  start(text?: string): void {
    this.ora.start(text);
  }

  succeed(text?: string): void {
    this.ora.succeed(text);
  }

  fail(text?: string): void {
    this.ora.fail(text);
  }
}
