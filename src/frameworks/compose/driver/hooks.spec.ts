import { expect } from "chai";
import { genHookScript } from "./hooks";
import { AppBundle } from "../interfaces";

describe("genHookScript", () => {
  const BUNDLE: AppBundle = {
    version: "v1alpha",
  };

  it("generates executable script from anonymous functions", () => {
    const hookFn = (b: AppBundle): AppBundle => {
      return b;
    };
    const expectedSnippet = `const bundle = ((b) => {
            return b;
        })({"version":"v1alpha"});`;
    expect(genHookScript(BUNDLE, hookFn)).to.include(expectedSnippet);
  });

  it("generates executable script from a named function", () => {
    function hookFn(b: AppBundle): AppBundle {
      return b;
    }
    const expectedSnippet = `const bundle = (function hookFn(b) {
            return b;
        })({"version":"v1alpha"});`;
    expect(genHookScript(BUNDLE, hookFn)).to.include(expectedSnippet);
  });

  it("generates executable script from an object method", () => {
    const a = {
      hookFn(b: AppBundle) {
        return b;
      },
    };
    const expectedSnippet = `const bundle = (function hookFn(b) {
                return b;
            })({"version":"v1alpha"});`;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(genHookScript(BUNDLE, a.hookFn)).to.include(expectedSnippet);
  });
});
