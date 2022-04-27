import { expect } from "chai";
import { FirebaseError } from "../../../error";
import * as cel from "../../../deploy/functions/cel";

describe("CEL evaluation", () => {
  describe("Identity expressions", () => {
    it("raises when the referenced parameter does not exist", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when the referenced parameter is of the wrong type", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO }}", { FOO: true });
      }).to.throw(FirebaseError);
    });

    it("pulls number parameters", () => {
      const params: Record<string, cel.Literal> = { FOO: 22, BAR: true, BAZ: "quox" };

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

    it("raises when a parameter is provided as the RHS", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR }}", { FOO: 22, BAR: 11 });
      }).to.throw(FirebaseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      // WIP: still need type-checking on resolveLiteral()
    });

    it("it determines whether the LHS resolves to the same thing as the RHS", () => {
      expect(cel.resolveExpression("boolean", "{{ params.FOO == 22 }}", { FOO: 22 })).to.be.true;
      expect(cel.resolveExpression("boolean", "{{ params.FOO == 11 }}", { FOO: 22 })).to.be.false;
      expect(cel.resolveExpression("boolean", "{{ params.FOO == 'bar baz' }}", { FOO: "bar baz" }))
        .to.be.true;
      expect(cel.resolveExpression("boolean", "{{ params.FOO == 'baz' }}", { FOO: "bar" })).to.be
        .false;
      expect(cel.resolveExpression("boolean", "{{ params.FOO == true }}", { FOO: true })).to.be
        .true;
      expect(cel.resolveExpression("boolean", "{{ params.FOO == false }}", { FOO: true })).to.be
        .false;
    });
  });

  describe("Ternary expressions", () => {
    it("raises when the LHS param does not exist", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", {});
      }).to.throw(FirebaseError);
    });

    it("raises when a parameter is provided as the RHS", () => {
      expect(() => {
        cel.resolveExpression("number", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: 22,
          BAR: 11,
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the type of the LHS and RHS do not match", () => {
      // WIP: still need type-checking on resolveLiteral()
    });

    it("raises when the ternary expression evaluates to something of the wrong type", () => {
      expect(() => {
        cel.resolveExpression("boolean", "{{ params.FOO == params.BAR ? 10 : 0 }}", {
          FOO: 22,
          BAR: 11,
        });
      }).to.throw(FirebaseError);
    });

    it("raises when the ternary expression evaluates to a missing parameter", () => {
      expect(() => {
        cel.resolveExpression(
          "number",
          "{{ params.FOO == params.BAR ? params.BAZ : params.QUOZ }}",
          { FOO: 22, BAR: 11 }
        );
      }).to.throw(FirebaseError);
    });

    it("it provides resolved parameters when the ternary expression calls for them", () => {
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: 22,
          IF_T: 10,
          IF_F: 0,
        })
      ).to.equal(10);
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: 11,
          IF_T: 10,
          IF_F: 0,
        })
      ).to.equal(0);
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: 22,
          IF_T: true,
          IF_F: false,
        })
      ).to.be.true;
      expect(
        cel.resolveExpression("boolean", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: 11,
          IF_T: true,
          IF_F: false,
        })
      ).to.be.false;
      expect(
        cel.resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: 22,
          IF_T: "bar",
          IF_F: "baz",
        })
      ).to.equal("bar");
      expect(
        cel.resolveExpression("string", "{{ params.FOO == 22 ? params.IF_T : params.IF_F }}", {
          FOO: 11,
          IF_T: "bar",
          IF_F: "baz",
        })
      ).to.equal("baz");
    });

    it("it provides literal expressions when the ternary expression calls for them", () => {
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", { FOO: 22 })
      ).to.equal(10);
      expect(
        cel.resolveExpression("number", "{{ params.FOO == 22 ? 10 : 0 }}", { FOO: 11 })
      ).to.equal(0);
      expect(cel.resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", { FOO: 22 }))
        .to.be.true;
      expect(cel.resolveExpression("boolean", "{{ params.FOO == 22 ? true : false }}", { FOO: 11 }))
        .to.be.false;
      expect(
        cel.resolveExpression("string", "{{ params.FOO == 22 ? 'bar' : 'baz' }}", { FOO: 22 })
      ).to.equal("bar");
      expect(
        cel.resolveExpression("string", "{{ params.FOO == 22 ? 'bar' : 'baz' }}", { FOO: 11 })
      ).to.equal("baz");
    });
  });
});
