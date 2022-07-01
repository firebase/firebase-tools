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
import { getValidator } from "../firebaseConfigValidate";
import { FirebaseConfig } from "../firebaseConfig";

describe("firebaseConfigValidate", () => {
  it("should accept a basic, valid config", () => {
    const config: FirebaseConfig = {
      database: {
        rules: "myrules.json",
      },
      hosting: {
        public: "public",
      },
      emulators: {
        database: {
          port: 8080,
        },
      },
    };

    const validator = getValidator();
    const isValid = validator(config);

    expect(isValid).to.be.true;
  });

  it("should report an extra top-level field", () => {
    // This config has an extra 'bananas' top-level property
    const config = {
      database: {
        rules: "myrules.json",
      },
      bananas: {},
    };

    const validator = getValidator();
    const isValid = validator(config);

    expect(isValid).to.be.false;
    expect(validator.errors).to.exist;
    expect(validator.errors!.length).to.eq(1);

    const firstError = validator.errors![0];
    expect(firstError.keyword).to.eq("additionalProperties");
    expect(firstError.dataPath).to.eq("");
    expect(firstError.params).to.deep.equal({ additionalProperty: "bananas" });
  });

  it("should report a missing required field", () => {
    // This config is missing 'storage.rules'
    const config = {
      storage: {},
    };

    const validator = getValidator();
    const isValid = validator(config);

    expect(isValid).to.be.false;
    expect(validator.errors).to.exist;
    expect(validator.errors!.length).to.eq(3);

    const [firstError, secondError, thirdError] = validator.errors!;

    // Missing required param
    expect(firstError.keyword).to.eq("required");
    expect(firstError.dataPath).to.eq(".storage");
    expect(firstError.params).to.deep.equal({ missingProperty: "rules" });

    // Because it doesn't match the object type, we also get an "is not an array"
    // error since JSON Schema can't tell which type it is closest to.
    expect(secondError.keyword).to.eq("type");
    expect(secondError.dataPath).to.eq(".storage");
    expect(secondError.params).to.deep.equal({ type: "array" });

    // Finally we get an error saying that 'storage' is not any of the known types
    expect(thirdError.keyword).to.eq("anyOf");
    expect(thirdError.dataPath).to.eq(".storage");
    expect(thirdError.params).to.deep.equal({});
  });

  it("should report a field with an incorrect type", () => {
    // This config has a number where it should have a string
    const config = {
      storage: {
        rules: 1234,
      },
    };

    const validator = getValidator();
    const isValid = validator(config);

    expect(isValid).to.be.false;
    expect(validator.errors).to.exist;
    expect(validator.errors!.length).to.eq(3);

    const [firstError, secondError, thirdError] = validator.errors!;

    // Wrong type
    expect(firstError.keyword).to.eq("type");
    expect(firstError.dataPath).to.eq(".storage.rules");
    expect(firstError.params).to.deep.equal({ type: "string" });

    // Because it doesn't match the object type, we also get an "is not an array"
    // error since JSON Schema can't tell which type it is closest to.
    expect(secondError.keyword).to.eq("type");
    expect(secondError.dataPath).to.eq(".storage");
    expect(secondError.params).to.deep.equal({ type: "array" });

    // Finally we get an error saying that 'storage' is not any of the known types
    expect(thirdError.keyword).to.eq("anyOf");
    expect(thirdError.dataPath).to.eq(".storage");
    expect(thirdError.params).to.deep.equal({});
  });
});
