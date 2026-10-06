import { expect } from "chai";
import { resolveExpression, ExprParseError } from "./cel";
import { ParamValue } from "./params";

function stringV(value: string): ParamValue {
  return new ParamValue(value, false, { string: true, number: false, boolean: false, list: false });
}
function numberV(value: number): ParamValue {
  return new ParamValue(value.toString(), false, {
    string: false,
    number: true,
    boolean: false,
    list: false,
  });
}
function boolV(value: boolean): ParamValue {
  return new ParamValue(value.toString(), false, {
    string: false,
    number: false,
    boolean: true,
    list: false,
  });
}
function listV(value: string[]): ParamValue {
  return ParamValue.fromList(value);
}

describe("CEL evaluation", () => {
  describe("String list resolution", () => {
    it("can pull lists directly out of paramvalues", () => {
      expect(
        resolveExpression("string[]", "{{ params.FOO }}", {
          FOO: listV(["1"]),
        }),
      ).to.deep.equal(["1"]);
    });

    it("can handle literals in a list", () => {
      expect(
        resolveExpression("string[]", '{{ params.FOO == params.FOO ? ["asdf"] : [] }}', {
          FOO: numberV(1),
        }),
      ).to.deep.equal(["asdf"]);
    });

    it("can handle CEL expressions in a list", () => {
      expect(
        resolveExpression("string[]", "{{ params.FOO == params.FOO ? [{{ params.BAR }}] : [] }}", {
          FOO: numberV(1),
          BAR: stringV("asdf"),
        }),
      ).to.deep.equal(["asdf"]);
    });

    it("can handle direct references to string params in a list", () => {
      expect(
        resolveExpression("string[]", "{{ params.FOO == params.FOO ? [params.BAR] : [] }}", {
          FOO: numberV(1),
          BAR: stringV("asdf"),
        }),
      ).to.deep.equal(["asdf"]);
    });

    it("can handle a list with multiple elements", () => {
      expect(
        resolveExpression(
          "string[]",
          '{{ params.FOO == params.FOO ? [ "foo", params.BAR, {{ params.BAR }} ] : [] }}',
          {
            FOO: numberV(1),
            BAR: stringV("asdf"),
          },
        ),
      ).to.deep.equal(["foo", "asdf", "asdf"]);
    });

    it("isn't picky about whitespace around the commas", () => {
      expect(
        resolveExpression(
          "string[]",
          '{{ params.FOO == params.FOO ? ["foo  ",params.BAR   ,{{ params.BAR }}] : [] }}',
          {
            FOO: numberV(1),
            BAR: stringV("asdf"),
          },
        ),
      ).to.deep.equal(["foo  ", "asdf", "asdf"]);
    });

    it("can do == comparisons between lists", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.FOO }}", {
          FOO: listV(["a", "2", "false"]),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO == ["a", "2", "false"] }}', {
          FOO: listV(["a", "2", "false"]),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.FOO }}", {
          FOO: listV(["a", "2", "false"]),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO != ["a", "2", "false"] }}', {
          FOO: listV(["a", "2", "false"]),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: listV(["a", "2", "false"]),
          BAR: listV(["b", "-2", "true"]),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO == ["a", "2", "false"] }}', {
          FOO: listV(["b", "-2", "true"]),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: listV(["a", "2", "false"]),
          BAR: listV(["b", "-2", "true"]),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO != ["a", "2", "false"] }}', {
          FOO: listV(["b", "-2", "true"]),
        }),
      ).to.be.true;
    });

    it("throws if asked to do </> type comparisons between lists", () => {
      expect(() =>
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: listV(["a", "2", "false"]),
          BAR: listV(["b", "-2", "true"]),
        }),
      ).to.throw(ExprParseError);
      expect(() =>
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: listV(["a", "2", "false"]),
          BAR: listV(["b", "-2", "true"]),
        }),
      ).to.throw(ExprParseError);
      expect(() =>
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: listV(["a", "2", "false"]),
          BAR: listV(["b", "-2", "true"]),
        }),
      ).to.throw(ExprParseError);
      expect(() =>
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: listV(["a", "2", "false"]),
          BAR: listV(["b", "-2", "true"]),
        }),
      ).to.throw(ExprParseError);
    });
  });

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
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == 11 }}", {
          FOO: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO == "bar" }}', {
          FOO: stringV("bar"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO == "baz" }}', {
          FOO: stringV("bar"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == true }}", {
          FOO: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == false }}", {
          FOO: boolV(true),
        }),
      ).to.be.false;
    });

    it("it handles the other cmp values using javascript's default behavior, even the stupid ones", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO != 22 }}", {
          FOO: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != 22 }}", {
          FOO: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= 22 }}", {
          FOO: numberV(33),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= 22 }}", {
          FOO: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= 22 }}", {
          FOO: numberV(11),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(33),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(11),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > 22 }}", {
          FOO: numberV(33),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > 22 }}", {
          FOO: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > 22 }}", {
          FOO: numberV(11),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < 22 }}", {
          FOO: numberV(33),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < 22 }}", {
          FOO: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= 22 }}", {
          FOO: numberV(11),
        }),
      ).to.be.true;

      expect(
        resolveExpression("boolean", '{{ params.FOO != "b" }}', {
          FOO: stringV("a"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO != "b" }}', {
          FOO: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO >= "b" }}', {
          FOO: stringV("a"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO >= "b" }}', {
          FOO: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO >= "b" }}', {
          FOO: stringV("c"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("a"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("c"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO > "b" }}', {
          FOO: stringV("a"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO > "b" }}', {
          FOO: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO > "b" }}', {
          FOO: stringV("c"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO < "b" }}', {
          FOO: stringV("a"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", '{{ params.FOO < "b" }}', {
          FOO: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", '{{ params.FOO <= "b" }}', {
          FOO: stringV("c"),
        }),
      ).to.be.false;

      expect(
        resolveExpression("boolean", "{{ params.FOO != true }}", {
          FOO: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != true }}", {
          FOO: boolV(false),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= true }}", {
          FOO: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= true }}", {
          FOO: boolV(false),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= true }}", {
          FOO: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= true }}", {
          FOO: boolV(false),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > true }}", {
          FOO: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > true }}", {
          FOO: boolV(false),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < true }}", {
          FOO: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < true }}", {
          FOO: boolV(false),
        }),
      ).to.be.true;
    });

    it("raises when a comparison is resolved as a type other than boolean", () => {
      expect(() => {
        resolveExpression("string", '{{ params.FOO == "bar" }}', { FOO: stringV("bar") });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        });
      }).to.throw(ExprParseError);
      // An unescaped quote hides the " ? ", so this reads as a comparison.
      expect(() => {
        resolveExpression("string", '{{ params.FOO == "a"b" ? "x" : "y" }}', {
          FOO: stringV('a"b'),
        });
      }).to.throw(ExprParseError);
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
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(11),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: stringV("bar"),
          BAR: stringV("bar"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: stringV("bar"),
          BAR: stringV("baz"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(false),
        }),
      ).to.be.false;
    });

    it("it handles the other cmp values using javascript's default behavior, even the stupid ones", () => {
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: numberV(33),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.be.true;

      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: stringV("a"),
          BAR: stringV("b"),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: stringV("b"),
          BAR: stringV("b"),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: stringV("c"),
          BAR: stringV("b"),
        }),
      ).to.be.false;

      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO != params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO >= params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO <= params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO > params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: boolV(true),
          BAR: boolV(true),
        }),
      ).to.be.false;
      expect(
        resolveExpression("boolean", "{{ params.FOO < params.BAR }}", {
          FOO: boolV(false),
          BAR: boolV(true),
        }),
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
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: boolV(true),
          IF_F: boolV(false),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: boolV(true),
          IF_F: boolV(false),
        }),
      ).to.be.false;
      expect(
        resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        }),
      ).to.equal("bar");
      expect(
        resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        }),
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {
          FOO: numberV(22),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {
          FOO: numberV(11),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", {
          FOO: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", {
          FOO: numberV(11),
        }),
      ).to.be.false;
      expect(
        resolveExpression("string", '{{ params.FOO == 22 ? "bar" : "baz" }}', {
          FOO: numberV(22),
        }),
      ).to.equal("bar");
      expect(
        resolveExpression("string", '{{ params.FOO == 22 ? "bar" : "baz" }}', {
          FOO: numberV(11),
        }),
      ).to.equal("baz");
    });

    it("it knows how to handle non-== comparisons by delegating to the Comparison expression evaluators", () => {
      expect(
        resolveExpression("number", "{{ params.FOO != 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO >= 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO <= 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO > 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("number", "{{ params.FOO < 22 ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
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
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: boolV(true),
          IF_F: boolV(false),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: boolV(true),
          IF_F: boolV(false),
        }),
      ).to.be.false;
      expect(
        resolveExpression("string", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        }),
      ).to.equal("bar");
      expect(
        resolveExpression("string", "{{ params.FOO == params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        }),
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? true : false }}", {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO == params.BAR ? true : false }}", {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.be.false;
      expect(
        resolveExpression("string", '{{ params.FOO == params.BAR ? "bar" : "baz" }}', {
          FOO: numberV(22),
          BAR: numberV(22),
        }),
      ).to.equal("bar");
      expect(
        resolveExpression("string", '{{ params.FOO == params.BAR ? "bar" : "baz" }}', {
          FOO: numberV(11),
          BAR: numberV(22),
        }),
      ).to.equal("baz");
    });

    it("resolves a ternary nested in a branch of a dual comparison ternary", () => {
      const expr = '{{ params.FOO == params.BAR ? "a" : params.FOO == params.BAZ ? "b" : "c" }}';
      expect(
        resolveExpression("string", expr, {
          FOO: stringV("a"),
          BAR: stringV("q"),
          BAZ: stringV("a"),
        }),
      ).to.equal("b");
      expect(
        resolveExpression("string", expr, {
          FOO: stringV("a"),
          BAR: stringV("q"),
          BAZ: stringV("r"),
        }),
      ).to.equal("c");
    });

    it("it knows how to handle non-== comparisons by delegating to the Comparison expression evaluators", () => {
      expect(
        resolveExpression("number", "{{ params.FOO != params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO >= params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(33),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO <= params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(11),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO > params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("number", "{{ params.FOO < params.BAR ? params.IF_T : params.IF_F }}", {
          FOO: numberV(22),
          BAR: numberV(22),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
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
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(false),
          IF_T: numberV(10),
          IF_F: numberV(0),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(true),
          IF_T: boolV(true),
          IF_F: boolV(false),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(false),
          IF_T: boolV(true),
          IF_F: boolV(false),
        }),
      ).to.be.false;
      expect(
        resolveExpression("string", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(true),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        }),
      ).to.equal("bar");
      expect(
        resolveExpression("string", "{{ params.FOO ? params.IF_T : params.IF_F }}", {
          FOO: boolV(false),
          IF_T: stringV("bar"),
          IF_F: stringV("baz"),
        }),
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: boolV(true),
        }),
      ).to.equal(10);
      expect(
        resolveExpression("number", "{{ params.FOO ? 10 : 0 }}", {
          FOO: boolV(false),
        }),
      ).to.equal(0);
      expect(
        resolveExpression("boolean", "{{ params.FOO ? true : false }}", {
          FOO: boolV(true),
        }),
      ).to.be.true;
      expect(
        resolveExpression("boolean", "{{ params.FOO ? true : false }}", {
          FOO: boolV(false),
        }),
      ).to.be.false;
      expect(
        resolveExpression("string", '{{ params.FOO ? "bar" : "baz" }}', {
          FOO: boolV(true),
        }),
      ).to.equal("bar");
      expect(
        resolveExpression("string", '{{ params.FOO ? "bar" : "baz" }}', {
          FOO: boolV(false),
        }),
      ).to.equal("baz");
    });

    it("resolves a ternary nested in a branch of a boolean conditioned ternary", () => {
      const expr = '{{ params.FLAG ? "a" : params.OTHER ? "b" : "c" }}';
      expect(resolveExpression("string", expr, { FLAG: boolV(true), OTHER: boolV(true) })).to.equal(
        "a",
      );
      expect(
        resolveExpression("string", expr, { FLAG: boolV(false), OTHER: boolV(true) }),
      ).to.equal("b");
      expect(
        resolveExpression("string", expr, { FLAG: boolV(false), OTHER: boolV(false) }),
      ).to.equal("c");
    });
  });

  describe("Nested ternary expressions", () => {
    it("resolves a ternary nested in the false branch", () => {
      const expr =
        '{{ params.PROJECT_ID == "xxx" ? "aaa" : params.PROJECT_ID == "yyy" ? "bbb" : "ccc" }}';
      expect(resolveExpression("string", expr, { PROJECT_ID: stringV("xxx") })).to.equal("aaa");
      expect(resolveExpression("string", expr, { PROJECT_ID: stringV("yyy") })).to.equal("bbb");
      expect(resolveExpression("string", expr, { PROJECT_ID: stringV("zzz") })).to.equal("ccc");
    });

    it("resolves a nested ternary with number branches", () => {
      const expr = '{{ params.PROJECT_ID == "xxx" ? 1 : params.PROJECT_ID == "yyy" ? 2 : 3 }}';
      expect(resolveExpression("number", expr, { PROJECT_ID: stringV("xxx") })).to.equal(1);
      expect(resolveExpression("number", expr, { PROJECT_ID: stringV("yyy") })).to.equal(2);
      expect(resolveExpression("number", expr, { PROJECT_ID: stringV("zzz") })).to.equal(3);
    });

    it("resolves a ternary nested in the true branch", () => {
      const expr = '{{ params.FOO == "x" ? params.BAR == "u" ? "a" : "b" : "c" }}';
      expect(resolveExpression("string", expr, { FOO: stringV("x"), BAR: stringV("u") })).to.equal(
        "a",
      );
      expect(resolveExpression("string", expr, { FOO: stringV("x"), BAR: stringV("v") })).to.equal(
        "b",
      );
      expect(resolveExpression("string", expr, { FOO: stringV("y"), BAR: stringV("u") })).to.equal(
        "c",
      );
    });

    it("resolves an expression with ternaries nested in both branches", () => {
      const expr = '{{ params.A ? params.B ? "1" : "2" : params.C ? "3" : "4" }}';
      expect(
        resolveExpression("string", expr, { A: boolV(true), B: boolV(true), C: boolV(false) }),
      ).to.equal("1");
      expect(
        resolveExpression("string", expr, { A: boolV(true), B: boolV(false), C: boolV(false) }),
      ).to.equal("2");
      expect(
        resolveExpression("string", expr, { A: boolV(false), B: boolV(false), C: boolV(true) }),
      ).to.equal("3");
      expect(
        resolveExpression("string", expr, { A: boolV(false), B: boolV(false), C: boolV(false) }),
      ).to.equal("4");
    });

    it("resolves a chain three levels deep", () => {
      const expr =
        '{{ params.FOO == "a" ? 1 : params.FOO == "b" ? 2 : params.FOO == "c" ? 3 : 4 }}';
      expect(resolveExpression("number", expr, { FOO: stringV("a") })).to.equal(1);
      expect(resolveExpression("number", expr, { FOO: stringV("b") })).to.equal(2);
      expect(resolveExpression("number", expr, { FOO: stringV("c") })).to.equal(3);
      expect(resolveExpression("number", expr, { FOO: stringV("d") })).to.equal(4);
    });

    it("provides resolved parameters from a nested branch", () => {
      const expr =
        '{{ params.FOO == "x" ? params.IF_A : params.FOO == "y" ? params.IF_B : params.IF_C }}';
      const params = {
        FOO: stringV("y"),
        IF_A: numberV(1),
        IF_B: numberV(2),
        IF_C: numberV(3),
      };
      expect(resolveExpression("number", expr, params)).to.equal(2);
    });

    it("resolves list branches in a nested ternary", () => {
      const expr = '{{ params.FOO == "x" ? ["a"] : params.FOO == "y" ? [params.BAR] : [] }}';
      expect(
        resolveExpression("string[]", expr, { FOO: stringV("y"), BAR: stringV("b") }),
      ).to.deep.equal(["b"]);
      expect(
        resolveExpression("string[]", expr, { FOO: stringV("z"), BAR: stringV("b") }),
      ).to.deep.equal([]);
    });

    it("resolves a list branch holding a value that contains a double quote", () => {
      expect(
        resolveExpression("string[]", '{{ params.FOO == "x" ? [params.Q] : [] }}', {
          FOO: stringV("x"),
          Q: stringV('a"b'),
        }),
      ).to.deep.equal(['a"b']);
      expect(
        resolveExpression("string[]", "{{ params.FLAG ? [params.Q] : [] }}", {
          FLAG: boolV(true),
          Q: stringV('a"b'),
        }),
      ).to.deep.equal(['a"b']);
    });

    it("doesn't end a literal at an escaped double quote", () => {
      expect(
        resolveExpression("string", '{{ params.FLAG ? "a\\"b" : "c" }}', {
          FLAG: boolV(false),
        }),
      ).to.equal("c");
    });

    it("doesn't split on a ? or a : inside a string literal", () => {
      expect(
        resolveExpression("string", '{{ params.FOO == "q" ? "x : y" : "z" }}', {
          FOO: stringV("a"),
        }),
      ).to.equal("z");
      expect(
        resolveExpression("string", '{{ params.FOO == "a" ? "x ? y" : "z" }}', {
          FOO: stringV("a"),
        }),
      ).to.equal("x ? y");
      expect(
        resolveExpression("string", '{{ params.FOO == "a : b" ? "z" : "w" }}', {
          FOO: stringV("a : b"),
        }),
      ).to.equal("z");
      expect(
        resolveExpression("string", '{{ params.FOO == "a" ? "x ? y : z" : "w" }}', {
          FOO: stringV("a"),
        }),
      ).to.equal("x ? y : z");
      expect(
        resolveExpression("string", '{{ params.FOO == "q" ? "z" : "x : y" }}', {
          FOO: stringV("a"),
        }),
      ).to.equal("x : y");
      expect(
        resolveExpression("boolean", '{{ params.FOO == "a ? b" }}', { FOO: stringV("a ? b") }),
      ).to.equal(true);
    });

    it("raises when a nested branch references a missing param", () => {
      expect(() => {
        resolveExpression(
          "string",
          '{{ params.FOO == "x" ? "a" : params.FOO == "y" ? params.MISSING : "c" }}',
          { FOO: stringV("y") },
        );
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression(
          "string",
          '{{ params.FOO == "x" ? "a" : params.MISSING == "y" ? "b" : "c" }}',
          { FOO: stringV("z") },
        );
      }).to.throw(ExprParseError);
    });

    it("raises when a nested branch resolves to a param of the wrong type", () => {
      expect(() => {
        resolveExpression(
          "string",
          '{{ params.FOO == "x" ? "a" : params.FOO == "y" ? params.NUM : "c" }}',
          { FOO: stringV("y"), NUM: numberV(2) },
        );
      }).to.throw(ExprParseError);
    });

    it("raises when a nested branch isn't a legal literal", () => {
      expect(() => {
        resolveExpression("number", '{{ params.FOO == "x" ? 1 : params.FOO == "y" ? abc : 3 }}', {
          FOO: stringV("y"),
        });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression(
          "string",
          '{{ params.FOO == "x" ? "a" : params.FOO == "y" ? bare : "c" }}',
          { FOO: stringV("y") },
        );
      }).to.throw(ExprParseError);
    });

    it("raises on ternaries with a missing or a stray delimiter", () => {
      expect(() => {
        resolveExpression("number", "{{ }}", {});
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO ?? 10 : 0 }}", { FOO: numberV(22) });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 22 : 0 }}", { FOO: numberV(22) });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 22 ? 10 }}", { FOO: numberV(22) });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("number", "{{ params.FOO == 22 ? 10 : }}", { FOO: numberV(22) });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("string", '{{ params.FOO == "a" ? "x" }}', { FOO: stringV("a") });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("string", '{{ params.FOO == "a" ? "x" ? "y" : "z" }}', {
          FOO: stringV("a"),
        });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("string", '{{ params.FOO ? "x" : "y" ? "z" }}', { FOO: boolV(false) });
      }).to.throw(ExprParseError);
      expect(() => {
        resolveExpression("string", '{{ params.FOO == "a" : "b" }}', { FOO: stringV("a") });
      }).to.throw(ExprParseError);
    });
  });
});
