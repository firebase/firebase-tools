/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import { FirebaseError } from "../error";

describe("error", () => {
  describe("FirebaseError", () => {
    it("should be an instance of Error", () => {
      const error = new FirebaseError("test-message");

      expect(error).to.be.instanceOf(Error);
    });

    it("should apply default options", () => {
      const error = new FirebaseError("test-message");

      expect(error).to.deep.include({ children: [], exit: 1, name: "FirebaseError", status: 500 });
    });

    it("should persist all options", () => {
      /**
       * All possible options that might be provided to `FirebaseError`.
       */
      type FirebaseErrorOptions = ConstructorParameters<typeof FirebaseError>[1];

      /*
       * The following `Required` ensures all options are defined, so the test
       * covers all properties.
       */
      const allOptions: Required<FirebaseErrorOptions> = {
        children: ["test-child-1", "test-child-2"],
        context: "test-context",
        exit: 123,
        original: new Error("test-original-error-message"),
        status: 456,
      };

      const error = new FirebaseError("test-message", allOptions);

      expect(error).to.deep.include(allOptions);
    });
  });
});
