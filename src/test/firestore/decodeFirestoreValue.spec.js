"use strict";

var chai = require("chai");
var decodeFirestoreValue = require("../../firestore/decodeFirestoreValue");
var expect = chai.expect;

describe("decodeFirestoreValue", () => {
  it("should decode a stringValue", () => {
    const data = {
      fields: {
        test: {
          stringValue: "a string",
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: "a string" });
  });

  it("should decode an integerValue", () => {
    const data = {
      fields: {
        test: {
          integerValue: 1,
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: 1 });
  });

  it("should decode a doubleValue", () => {
    const data = {
      fields: {
        test: {
          doubleValue: 1.2,
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: 1.2 });
  });

  it("should decode a booleanValue", () => {
    const data = {
      fields: {
        test: {
          booleanValue: true,
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: true });
  });

  it("should decode a geoPointValue", () => {
    const data = {
      fields: {
        test: {
          geoPointValue: {
            latitude: 10,
            longitude: 20,
          },
        },
      },
    };

    const decoded = decodeFirestoreValue(data);
    expect(decoded).to.deep.equal({ test: { latitude: 10, longitude: 20 } });
  });

  it("should decode a timestampValue", () => {
    const data = {
      fields: {
        test: {
          timestampValue: "2019-01-17T22:15:56Z",
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: "2019-01-17T22:15:56Z" });
  });

  it("should decode a nullValue", () => {
    const data = {
      fields: {
        test: {
          nullValue: null,
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: null });
  });

  it("should decode a referenceValue", () => {
    const data = {
      fields: {
        test: {
          referenceValue: "/path/to/doc",
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: "/path/to/doc" });
  });

  it("should decode an arrayValue", () => {
    const data = {
      fields: {
        test: {
          arrayValue: {
            values: [{ integerValue: 1 }, { integerValue: 2 }],
          },
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: [1, 2] });
  });

  it("should decode a nested arrayValue", () => {
    const data = {
      fields: {
        test: {
          arrayValue: {
            values: [
              {
                arrayValue: {
                  values: [{ integerValue: 1 }, { integerValue: 2 }],
                },
              },
              {
                arrayValue: {
                  values: [{ integerValue: 1 }, { integerValue: 2 }],
                },
              },
            ],
          },
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: [[1, 2], [1, 2]] });
  });

  it("should decode a mapValue", () => {
    const data = {
      fields: {
        test: {
          mapValue: {
            fields: {
              count: {
                integerValue: 1,
              },
            },
          },
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: { count: 1 } });
  });

  it("should decode a nested mapValue", () => {
    const data = {
      fields: {
        test: {
          mapValue: {
            fields: {
              count: {
                mapValue: {
                  fields: {
                    userCount: {
                      integerValue: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(decodeFirestoreValue(data)).to.deep.equal({ test: { count: { userCount: 1 } } });
  });
});
