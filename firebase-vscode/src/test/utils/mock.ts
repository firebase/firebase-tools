import { Ref } from "../../utils/test_hooks";
import { addTearDown } from "./test_hooks";
import * as vscode from "vscode";

/** A function that creates a new object which partially an interface.
 *
 * Unimplemented properties will throw an error when accessed.
 */
export function createFake<T>(overrides: Partial<T> = {}): T {
  const proxy = new Proxy(overrides, {
    get(target, prop) {
      if (Reflect.has(overrides, prop)) {
        return Reflect.get(overrides, prop);
      }

      return Reflect.get(target, prop);
    },

    set(target, prop, newVal) {
      return Reflect.set(target, prop, newVal);
    },
  });

  return proxy as T;
}

/** A function designed to mock objects inside unit tests */
export function mock<T>(ref: Ref<T>, value: Partial<T> | undefined) {
  const current = ref.value;
  addTearDown(() => {
    ref.value = current;
  });

  const fake = !value ? value : createFake<T>(value);

  // Unsafe cast, but it's fine because we're only using this in tests.
  ref.value = fake as T;
}

export function createFakeContext(): vscode.ExtensionContext {
  const context = createFake<vscode.ExtensionContext>({
    subscriptions: [],
  });

  addTearDown(() => {
    context.subscriptions.forEach((sub) => sub.dispose());
  });

  return context;
}
