import { expect } from "chai";
import { FirebaseError } from "../../../error";
import * as cel from "../../../deploy/functions/cel";
import { ParamValue } from "../../../deploy/functions/params";

describe("CEL evaluation", () => {
  describe("Identity expressions", () => {
    it("raises when the referenced parameter does not exist", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when the referenced parameter is of the wrong type", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("pulls number parameters", () => {
      const params: Record<string, ParamValue> = {
        FOO: new ParamValue("22", false, { number: true }),
        BAR: new ParamValue("true", false, { boolean: true }),
        BAZ: new ParamValue("quox", false, { string: true }),
      };

      expect(cel.resolveExpression("number", "{{ params.FOO }}", params)).to.equal(22);
      expect(cel.resolveExpression("boolean", "{{ params.BAR }}", params)).to.be.true;
      expect(cel.resolveExpression("string", "{{ params.BAZ }}", params)).to.equal("quox");
    });
  });

  describe("Equality expressions", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == 22 }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == 'asdf' }}", {
          FOO: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("it determines whether the LHS resolves to the same thing as the RHS", () => {
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 }}", {
          FOO: new ParamValue("22", false, { number: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 11 }}", {
          FOO: new ParamValue("22", false, { number: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("boolean", '{{ params.FOO == "bar baz" }}', {
          FOO: new ParamValue("bar baz", false, { string: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", '{{ params.FOO == "baz" }}', {
          FOO: new ParamValue("bar", false, { string: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == true }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == false }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
        })
      ).to.be.false;
    });
  });

  describe("Dual equality expressions", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          BAR: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the RHS param does not exist", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when a literal is provided as the LHS", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ 22 == 11 }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("22", false, { number: true }),
          BAR: new ParamValue("true", false, { boolean: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("it determines whether the LHS resolves to the same thing as the RHS", () => {
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("22", false, { number: true }),
          BAR: new ParamValue("22", false, { number: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("22", false, { number: true }),
          BAR: new ParamValue("11", false, { number: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("bar", false, { string: true }),
          BAR: new ParamValue("bar", false, { string: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("bar", false, { string: true }),
          BAR: new ParamValue("baz", false, { string: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
          BAR: new ParamValue("true", false, { boolean: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
          BAR: new ParamValue("false", false, { boolean: true }),
        })
      ).to.be.false;
    });
  });

  describe("Ternary expressions conditioned on an equality test", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when a parameter is provided as the RHS", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: new ParamValue("22", false, { number: true }),
          BAR: new ParamValue("11", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO == 'asdf' ? 10 : 0 }}", {
          FOO: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the ternary expression evaluates to something of the wrong type", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: new ParamValue("22", false, { number: true }),
          BAR: new ParamValue("11", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the ternary expression evaluates to a missing parameter", () => {
      expect(() => {
        cel.resolveExpression(
          "number",
          "{{ params.FOO == params.BAR ? params.BAZ : params.QUOZ }}",
          {
            FOO: new ParamValue("22", false, { number: true }),
            BAR: new ParamValue("11", false, { number: true }),
          }
        );
      }).to.throw(FirebaseError);
    });

    it("it provides resolved parameters when the ternary expression calls for them", () => {
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("22", false, { number: true }),
          IF_T: new ParamValue("10", false, { number: true }),
          IF_F: new ParamValue("0", false, { number: true }),
        })
      ).to.equal(10);
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("11", false, { number: true }),
          IF_T: new ParamValue("10", false, { number: true }),
          IF_F: new ParamValue("0", false, { number: true }),
        })
      ).to.equal(0);
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("22", false, { number: true }),
          IF_T: new ParamValue("true", false, { boolean: true }),
          IF_F: new ParamValue("false", false, { boolean: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("11", false, { number: true }),
          IF_T: new ParamValue("true", false, { boolean: true }),
          IF_F: new ParamValue("false", false, { boolean: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("22", false, { number: true }),
          IF_T: new ParamValue("bar", false, { string: true }),
          IF_F: new ParamValue("baz", false, { string: true }),
        })
      ).to.equal("bar");
      expect(
        cel.resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("11", false, { number: true }),
          IF_T: new ParamValue("bar", false, { string: true }),
          IF_F: new ParamValue("baz", false, { string: true }),
        })
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {
          FOO: new ParamValue("22", false, { number: true }),
        })
      ).to.equal(10);
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {
          FOO: new ParamValue("11", false, { number: true }),
        })
      ).to.equal(0);
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", {
          FOO: new ParamValue("22", false, { number: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", {
          FOO: new ParamValue("11", false, { number: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("string", '{{ params.FOO == 22 ? "bar" : "baz" }}', {
          FOO: new ParamValue("22", false, { number: true }),
        })
      ).to.equal("bar");
      expect(
        cel.resolveExpression("string", '{{ params.FOO == 22 ? "bar" : "baz" }}', {
          FOO: new ParamValue("11", false, { number: true }),
        })
      ).to.equal("baz");
    });
  });

  describe("Ternary expressions conditioned on a boolean parameter", () => {
    it("raises when the condition param does not exist", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when the condition param is not a boolean", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the ternary expression evaluates to something of the wrong type", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO ? 10 : 0 }}", {
          FOO: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the ternary expression evaluates to a missing parameter", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO ? params.BAZ : params.QUOZ }}", {
          FOO: new ParamValue("22", false, { number: true }),
        });
      }).to.throw(FirebaseError);
    });

    it("it provides resolved parameters when the ternary expression calls for them", () => {
      expect(
        cel.resolveExpression("number", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
          IF_T: new ParamValue("10", false, { number: true }),
          IF_F: new ParamValue("0", false, { number: true }),
        })
      ).to.equal(10);
      expect(
        cel.resolveExpression("number", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("false", false, { boolean: true }),
          IF_T: new ParamValue("10", false, { number: true }),
          IF_F: new ParamValue("0", false, { number: true }),
        })
      ).to.equal(0);
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
          IF_T: new ParamValue("true", false, { boolean: true }),
          IF_F: new ParamValue("false", false, { boolean: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("false", false, { boolean: true }),
          IF_T: new ParamValue("true", false, { boolean: true }),
          IF_F: new ParamValue("false", false, { boolean: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("string", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
          IF_T: new ParamValue("bar", false, { string: true }),
          IF_F: new ParamValue("baz", false, { string: true }),
        })
      ).to.equal("bar");
      expect(
        cel.resolveExpression("string", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: new ParamValue("false", false, { boolean: true }),
          IF_T: new ParamValue("bar", false, { string: true }),
          IF_F: new ParamValue("baz", false, { string: true }),
        })
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        cel.resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
        })
      ).to.equal(10);
      expect(
        cel.resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: new ParamValue("false", false, { boolean: true }),
        })
      ).to.equal(0);
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO ? true : false }}", {
          FOO: new ParamValue("true", false, { boolean: true }),
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO ? true : false }}", {
          FOO: new ParamValue("false", false, { boolean: true }),
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("string", '{{ params.FOO ? "bar" : "baz" }}', {
          FOO: new ParamValue("true", false, { boolean: true }),
        })
      ).to.equal("bar");
      expect(
        cel.resolveExpression("string", '{{ params.FOO ? "bar" : "baz" }}', {
          FOO: new ParamValue("false", false, { boolean: true }),
        })
      ).to.equal("baz");
    });
  });
});
