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

  stop(): void {
    this.ora.stop();
  }

  succeed(text?: string): void {
    this.ora.succeed(text);
  }

  fail(text?: string): void {
    this.ora.fail(text);
  }

  warn(text?: string): void {
    this.ora.warn(text);
  }

  info(text?: string): void {
    this.ora.info(text);
  }

  stopAndPersist(options?: ora.PersistOptions): void {
    this.ora.stopAndPersist(options);
  }

  clear(): void {
    this.ora.clear();
  }

  render(): void {
    this.ora.render();
  }

  frame(): void {
    this.ora.frame();
  }
}
