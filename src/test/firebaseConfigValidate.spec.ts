import { expect } from "chai";
import { getValidator } from "../firebaseConfigValidate";
import { FirebaseConfig } from "../firebaseConfig";
import { valid } from "semver";

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
