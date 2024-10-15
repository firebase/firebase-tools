import * as vscode from "vscode";

let tearDowns: Array<() => void | Promise<void>> = [];

/** Registers a logic to run after the current test ends.
 *
 * This is useful to avoid having to use a try/finally block.
 *
 * The callback is bound to the suite, and when that suite/test ends, the callback is unregistered.
 */
export function addTearDown(cb: () => void | Promise<void>) {
  tearDowns.push(cb);
}

/** Registers a disposable to dispose after the current test ends.
 *
 * This is sugar for `addTearDown(() => disposable?.dispose())`.
 */
export function addDisposable(disposable: vscode.Disposable | undefined) {
  if (disposable) {
    addTearDown(() => disposable.dispose());
  }
}

let setups: Array<() => void | Promise<void>> = [];

/** Registers initialization logic to run before every tests in that suite.
 *
 * The callback is bound to the suite, and when that suite ends, the callback is unregistered.
 */
export function addSetup(cb: () => void | Promise<void>) {
  setups.push(cb);
}

/** A custom "test" to work around "afterEach" not working with the current configs */
export function firebaseTest(
  description: string,
  cb: () => void | Promise<void>,
) {
  // Since tests may execute in any order, we dereference the list of setup callbacks
  // to unsure that other suites' setups don't affect this test.
  const testSetups = [...setups];
  const testTearDowns = [...tearDowns];
  // Tests may call addTearDown to register a callback to run after the test ends.
  // We make sure those callbacks are applied only to this test.
  const previousTearDowns = tearDowns;
  tearDowns = testTearDowns;

  setup(async function () {
    await runGuarded(testSetups);
  });

  teardown(async function () {
    await runGuarded(testTearDowns.reverse());
    tearDowns = previousTearDowns;
  });

  test(description, async function () {
    await cb();
  });
}

export function firebaseSuite(description: string, cb: () => void) {
  suite(description, () => {
    // Scope setups to the suite.
    const previousSetups = setups;
    const previousTearDowns = tearDowns;
    // Nested suites inherits the setups/teardown from the parent suite.
    setups = [...previousSetups];
    tearDowns = [...previousTearDowns];

    try {
      cb();
    } finally {
      // The suite has finished registering tests, so we restore the previous setups.
      setups = previousSetups;
      tearDowns = previousTearDowns;
    }
  });
}

/** Runs callbacks while making sure all of them are executed even if one throws.
 *
 * If at least one error is thrown, the first one is rethrown.
 */
async function runGuarded(callbacks: Array<() => void | Promise<void>>) {
  let firstError: Error | undefined;

  for (const cb of callbacks) {
    try {
      await cb();
    } catch (e) {
      firstError ??= e as Error;
    }
  }

  if (firstError) {
    throw firstError;
  }
}
