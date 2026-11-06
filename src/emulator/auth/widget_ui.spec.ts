import { expect } from "chai";

import { WIDGET_UI } from "./widget_ui";

describe("WIDGET_UI", () => {
  it("should only treat provider IDs with a literal 'saml.' prefix as SAML providers", () => {
    // The script is built from a template literal, so the source needs `\\.` for the browser to receive `\.`.
    expect(WIDGET_UI).to.include("providerId.match(/^saml\\./)");
  });
});
