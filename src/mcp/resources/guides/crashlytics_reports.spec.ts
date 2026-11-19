import { expect } from "chai";
import { McpContext } from "../../types";
import { crashlytics_reports } from "./crashlytics_reports";

const MOCK_CONTEXT = {} as McpContext;

describe("crashlytics_reports guide", () => {
  it("includes the Custom Keys section with topCustomKeys and a filterExpression example", async () => {
    const result = await crashlytics_reports.fn(
      "firebase://guides/crashlytics/reports",
      MOCK_CONTEXT,
    );
    const firstContent = result.contents[0];
    const text = firstContent && "text" in firstContent ? firstContent.text : "";

    expect(text).to.include("### Custom Keys");
    expect(text).to.include("`topCustomKeys` Report (web only)");
    expect(text).to.include('custom_keys.env = "prod"');
    expect(text).to.include("except `topIssues`");
    expect(text).to.not.include("filter_expression");
  });
});
