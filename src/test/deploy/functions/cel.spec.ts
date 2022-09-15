import { expect } from "chai";
import { resolveExpression, ExprParseError } from "../../../deploy/functions/cel";
import { ParamValue } from "../../../deploy/functions/params";

function stringV(value: string): ParamValue {
  return new ParamValue(value, false, { string: true, number: false, boolean: false });
}
function numberV(value: number): ParamValue {
  return new ParamValue(value.toString(), false, { string: false, number: true, boolean: false });
}
function boolV(value: boolean): ParamValue {
  return new ParamValue(value.toString(), false, { string: false, number: false, boolean: true });
}

describe("CEL evaluation", () => {
  describe("Identity expressions", () => {
    it("raises when the referenced parameter does not exist", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO }}", {});
      }).to.throw(ExprParseError);
    });

    it("raises when the referenced parameter is of the wrong type", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO }}", {
          FOO: boolV(true),
        });
      }).to.throw(ExprParseError);
    });

    it("pulls number parameters", () => {
      const params: Record<string, ParamValue> = {
        FOO: numberV(22),
        BAR: boolV(true),
        BAZ: stringV("quox"),
      };

      expect(resolveExpression("number", "{{ params.FOO }}", params)).to.equal(22);
      expect(resolveExpression("boolean", "{{ params.BAR }}", params)).to.be.true;
      expect(resolveExpression("string", "{{ params.BAZ }}", params)).to.equal("quox");
    });
  });

  describe("Comparison expressions", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == 22 }}", {});
      }).to.throw(ExprParseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == 'asdf' }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("it determines whether or not the LHS resolves to the same thing as the RHS if cmp is ==", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == 11 }}", {
          FOO: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO == "bar" }}', {
          FOO: stringV("bar"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO == "baz" }}', {
          FOO: stringV("bar"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == true }}", {
          FOO: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == false }}", {
          FOO: boolV(true),
        })
      ).to.be.false;
    });

    it("it handles the other cmp values using javascript's default behavior, even the stupid ones", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO != 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= 22 }}", {
          FOO: numberV(33),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= 22 }}", {
          FOO: numberV(11),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(33),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(11),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > 22 }}", {
          FOO: numberV(33),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > 22 }}", {
          FOO: numberV(11),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < 22 }}", {
          FOO: numberV(33),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < 22 }}", {
          FOO: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(11),
        })
      ).to.be.true;

      expect(
        resolveExpression("boolean", '{{ params.FOO != "b" }}', {
          FOO: stringV("a"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO != "b" }}', {
          FOO: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO >= "b" }}', {
          FOO: stringV("a"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO >= "b" }}', {
          FOO: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO >= "b" }}', {
          FOO: stringV("c"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("a"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("c"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO > "b" }}', {
          FOO: stringV("a"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO > "b" }}', {
          FOO: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO > "b" }}', {
          FOO: stringV("c"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO < "b" }}', {
          FOO: stringV("a"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO < "b" }}', {
          FOO: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("c"),
        })
      ).to.be.false;

      expect(
        resolveExpression("boolean", "{{ params.FOO != true }}", {
          FOO: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != true }}", {
          FOO: boolV(false),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= true }}", {
          FOO: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= true }}", {
          FOO: boolV(false),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= true }}", {
          FOO: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= true }}", {
          FOO: boolV(false),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > true }}", {
          FOO: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > true }}", {
          FOO: boolV(false),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < true }}", {
          FOO: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < true }}", {
          FOO: boolV(false),
        })
      ).to.be.true;
    });
  });

  describe("Dual comparison expressions", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          BAR: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the RHS param does not exist", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when a literal is provided as the LHS", () => {
      expect(() => {
        resolveExpression("boolean", "{{ 22 == 11 }}", {});
      }).to.throw(ExprParseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: numberV(22),
          BAR: boolV(true),
        });
      }).to.throw(ExprParseError);
    });

    it("it determines whether or not the LHS resolves to the same thing as the RHS if cmp is ==", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(11),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: stringV("bar"),
          BAR: stringV("bar"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: stringV("bar"),
          BAR: stringV("baz"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(false),
        })
      ).to.be.false;
    });

    it("it handles the other cmp values using javascript's default behavior, even the stupid ones", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.be.true;

      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        })
      ).to.be.false;

      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        })
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        })
      ).to.be.true;
    });
  });

  describe("Ternary expressions conditioned on an comparison test", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {});
      }).to.throw(ExprParseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 'asdf' ? 10 : 0 }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the ternary expression evaluates to something of the wrong type", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == 22? 10 : 0 }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the ternary expression evaluates to a missing parameter", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 22 ? params.BAZ : params.QUOZ }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 22 ? params.BAZ : params.QUOZ }}", {
          FOO: numberV(11),
        });
      }).to.throw(ExprParseError);
    });

    it("it provides resolved parameters when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: boolV(true),
          IF_F: boolV(false),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: boolV(true),
          IF_F: boolV(false),
        })
      ).to.be.false;
      expect(
        resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        })
      ).to.equal("bar");
      expect(
        resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        })
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {
          FOO: numberV(22),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {
          FOO: numberV(11),
        })
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", {
          FOO: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", {
          FOO: numberV(11),
        })
      ).to.be.false;
      expect(
        resolveExpression("string", '{{ params.FOO == 22 ? "bar" : "baz" }}', {
          FOO: numberV(22),
        })
      ).to.equal("bar");
      expect(
        resolveExpression("string", '{{ params.FOO == 22 ? "bar" : "baz" }}', {
          FOO: numberV(11),
        })
      ).to.equal("baz");
    });

    it("it knows how to handle non-== comparisons by delegating to the Comparison expression evaluators", () => {
      expect(
        resolveExpression("number", "{{ params.FOO != 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO >= 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO <= 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO > 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
      expect(
        resolveExpression("number", "{{ params.FOO < 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
    });
  });

  describe("Ternary expressions conditioned on an comparison test between two params", () => {
    it("raises when one of the params to compare doesn't exist", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          BAR: numberV(22),
        });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {});
      }).to.throw(ExprParseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(22),
          BAR: boolV(true),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the ternary expression evaluates to something of the wrong type", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(22),
          BAR: numberV(11),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the ternary expression evaluates to a missing parameter", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR ? params.BAZ : params.QUOZ }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR ? params.BAZ : params.QUOZ }}", {
          FOO: numberV(22),
          BAR: numberV(11),
        });
      }).to.throw(ExprParseError);
    });

    it("it provides resolved parameters when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: boolV(true),
          IF_F: boolV(false),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: boolV(true),
          IF_F: boolV(false),
        })
      ).to.be.false;
      expect(
        resolveExpression("string", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        })
      ).to.equal("bar");
      expect(
        resolveExpression("string", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        })
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? true : false }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? true : false }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.be.false;
      expect(
        resolveExpression("string", '{{ params.FOO == params.BAR ? "bar" : "baz" }}', {
          FOO: numberV(22),
          BAR: numberV(22),
        })
      ).to.equal("bar");
      expect(
        resolveExpression("string", '{{ params.FOO == params.BAR ? "bar" : "baz" }}', {
          FOO: numberV(11),
          BAR: numberV(22),
        })
      ).to.equal("baz");
    });

    it("it knows how to handle non-== comparisons by delegating to the Comparison expression evaluators", () => {
      expect(
        resolveExpression("number", "{{ params.FOO != params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO >= params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO <= params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO > params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
      expect(
        resolveExpression("number", "{{ params.FOO < params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
    });
  });

  describe("Ternary expressions conditioned on a boolean parameter", () => {
    it("raises when the condition param does not exist", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {});
      }).to.throw(ExprParseError);
    });

    it("raises when the condition param is not a boolean", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the ternary expression evaluates to something of the wrong type", () => {
      expect(() => {
        resolveExpression("boolean", "{{ params.FOO ? 10 : 0 }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("raises when the ternary expression evaluates to a missing parameter", () => {
      expect(() => {
        resolveExpression("number", "{{ params.FOO ? params.BAZ : params.QUOZ }}", {
          FOO: numberV(22),
        });
      }).to.throw(ExprParseError);
    });

    it("it provides resolved parameters when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(true),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(false),
          IF_T: numberV(10),
          IF_F: numberV(0),
        })
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(true),
          IF_T: boolV(true),
          IF_F: boolV(false),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(false),
          IF_T: boolV(true),
          IF_F: boolV(false),
        })
      ).to.be.false;
      expect(
        resolveExpression("string", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(true),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        })
      ).to.equal("bar");
      expect(
        resolveExpression("string", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(false),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        })
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: boolV(true),
        })
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: boolV(false),
        })
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO ? true : false }}", {
          FOO: boolV(true),
        })
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO ? true : false }}", {
          FOO: boolV(false),
        })
      ).to.be.false;
      expect(
        resolveExpression("string", '{{ params.FOO ? "bar" : "baz" }}', {
          FOO: boolV(true),
        })
      ).to.equal("bar");
      expect(
        resolveExpression("string", '{{ params.FOO ? "bar" : "baz" }}', {
          FOO: boolV(false),
        })
      ).to.equal("baz");
    });
  });
});
