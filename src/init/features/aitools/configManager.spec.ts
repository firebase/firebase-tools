import { expect } from "chai";
import {
  findFirebaseSection,
  replaceFirebaseSection,
  insertFirebaseSection,
  generateFirebasePrompt,
  wrapInFirebaseTags,
  generateDiff,
} from "./configManager";

describe("configManager", () => {
  describe("findFirebaseSection", () => {
    it("should find existing firebase section with attributes", () => {
      const content = `<firebase_prompts version="1.0.0" features="functions,firestore">
Firebase content
</firebase_prompts>`;
      const result = findFirebaseSection(content);
      expect(result).to.not.be.null;
      expect(result!.found).to.be.true;
      expect(result!.version).to.equal("1.0.0");
      expect(result!.features).to.deep.equal(["functions", "firestore"]);
      expect(result!.content).to.include("Firebase content");
    });

    it("should find section without attributes", () => {
      const content = `<firebase_prompts>Simple content</firebase_prompts>`;
      const result = findFirebaseSection(content);
      expect(result).to.not.be.null;
      expect(result!.found).to.be.true;
      expect(result!.version).to.be.undefined;
      expect(result!.features).to.be.undefined;
    });

    it("should return null when no section exists", () => {
      const content = `Just user content
No firebase section here`;
      const result = findFirebaseSection(content);
      expect(result).to.be.null;
    });

    it("should handle empty content", () => {
      const result = findFirebaseSection("");
      expect(result).to.be.null;
    });

    it("should find first section when multiple exist", () => {
      const content = `<firebase_prompts>Old section 1</firebase_prompts>
Middle content
<firebase_prompts>Old section 2</firebase_prompts>`;
      const result = findFirebaseSection(content);
      expect(result).to.not.be.null;
      expect(result!.content).to.include("Old section 1");
    });

    it("should calculate correct start and end positions", () => {
      const content = `User content before
<firebase_prompts version="0.9.0" features="functions">
Old Firebase content
</firebase_prompts>
User content after`;
      const result = findFirebaseSection(content);
      expect(result).to.not.be.null;
      const substring = content.substring(result!.start, result!.end);
      expect(substring).to.include("<firebase_prompts");
      expect(substring).to.include("</firebase_prompts>");
    });
  });

  describe("replaceFirebaseSection", () => {
    const newSection = `<firebase_prompts version="1.0.0" features="functions,firestore">
New Firebase content
</firebase_prompts>`;

    it("should replace single firebase section", () => {
      const content = `User content before
<firebase_prompts version="0.9.0" features="functions">
Old Firebase content
</firebase_prompts>
User content after`;
      const result = replaceFirebaseSection(content, newSection);
      expect(result).to.include("User content before");
      expect(result).to.include("User content after");
      expect(result).to.include("New Firebase content");
      expect(result).to.not.include("Old Firebase content");
    });

    it("should replace multiple sections with one", () => {
      const content = `<firebase_prompts>Old section 1</firebase_prompts>
Middle content
<firebase_prompts>Old section 2</firebase_prompts>`;
      const result = replaceFirebaseSection(content, newSection);
      expect(result).to.include("Middle content");
      expect(result).to.include("New Firebase content");
      expect(result).to.not.include("Old section 1");
      expect(result).to.not.include("Old section 2");

      // Should only have one firebase section
      const matches = result.match(/<firebase_prompts/g);
      expect(matches).to.have.lengthOf(1);
    });

    it("should preserve content outside tags", () => {
      const content = `User content before
<firebase_prompts version="0.9.0" features="functions">
Old Firebase content
</firebase_prompts>
User content after`;
      const result = replaceFirebaseSection(content, newSection);
      const lines = result.split("\n");
      expect(lines[0]).to.equal("User content before");
      expect(lines[lines.length - 1]).to.equal("User content after");
    });

    it("should return original content if no section exists", () => {
      const content = `Just user content
No firebase section here`;
      const result = replaceFirebaseSection(content, newSection);
      expect(result).to.equal(content);
    });

    it("should handle empty content", () => {
      const result = replaceFirebaseSection("", newSection);
      expect(result).to.equal("");
    });
  });

  describe("insertFirebaseSection", () => {
    const section = `<firebase_prompts>New content</firebase_prompts>`;

    it("should append to end by default", () => {
      const content = `Just user content
No firebase section here`;
      const result = insertFirebaseSection(content, section);
      expect(result).to.include(content);
      expect(result).to.include(section);
      expect(result.indexOf(content)).to.be.lessThan(result.indexOf(section));
    });

    it("should insert at start when specified", () => {
      const content = `Just user content
No firebase section here`;
      const result = insertFirebaseSection(content, section, "start");
      expect(result).to.include(content);
      expect(result).to.include(section);
      expect(result.indexOf(section)).to.be.lessThan(result.indexOf(content));
    });

    it("should handle empty files", () => {
      const result = insertFirebaseSection("", section);
      expect(result).to.equal(section);
    });

    it("should add proper newlines when appending", () => {
      const contentWithNewline = "Content\n";
      const result = insertFirebaseSection(contentWithNewline, section);
      expect(result).to.equal(`Content\n\n${section}`);

      const contentWithoutNewline = "Content";
      const result2 = insertFirebaseSection(contentWithoutNewline, section);
      expect(result2).to.equal(`Content\n\n${section}`);
    });
  });

  describe("generateFirebasePrompt", () => {
    it("should wrap content in firebase_prompts tags", () => {
      const result = generateFirebasePrompt(["functions"]);
      expect(result).to.include('<firebase_prompts version="1.0.0" features="functions">');
      expect(result).to.include("</firebase_prompts>");
      expect(result).to.include("{{CONTENT}}");
    });

    it("should include version and features attributes", () => {
      const result = generateFirebasePrompt(["functions", "firestore"], "2.0.0");
      expect(result).to.include('version="2.0.0"');
      expect(result).to.include('features="functions,firestore"');
    });

    it("should add auto-generated comment", () => {
      const result = generateFirebasePrompt([]);
      expect(result).to.include("<!-- Firebase Tools Context - Auto-generated, do not edit -->");
    });

    it("should handle empty features array", () => {
      const result = generateFirebasePrompt([]);
      expect(result).to.include('<firebase_prompts version="1.0.0">');
      expect(result).to.not.include("features=");
    });
  });

  describe("wrapInFirebaseTags", () => {
    it("should wrap content with firebase tags", () => {
      const content = "Test content";
      const result = wrapInFirebaseTags(content, ["functions"]);
      expect(result).to.include('<firebase_prompts version="1.0.0" features="functions">');
      expect(result).to.include("Test content");
      expect(result).to.include("</firebase_prompts>");
    });

    it("should preserve content formatting", () => {
      const content = "Line 1\n  Line 2 with indent\nLine 3";
      const result = wrapInFirebaseTags(content, []);
      expect(result).to.include(content);
    });
  });

  describe("generateDiff", () => {
    it("should generate diff showing added lines", () => {
      const original = "Line 1\nLine 2";
      const modified = "Line 1\nLine 2\nLine 3";
      const diff = generateDiff(original, modified);
      expect(diff).to.include("+Line 3");
    });

    it("should generate diff showing removed lines", () => {
      const original = "Line 1\nLine 2\nLine 3";
      const modified = "Line 1\nLine 3";
      const diff = generateDiff(original, modified);
      expect(diff).to.include("-Line 2");
    });

    it("should generate diff showing unchanged lines", () => {
      const original = "Line 1\nLine 2\nLine 3";
      const modified = "Line 1\nModified Line 2\nLine 3";
      const diff = generateDiff(original, modified);
      expect(diff).to.include(" Line 1");
      expect(diff).to.include("-Line 2");
      expect(diff).to.include("+Modified Line 2");
      expect(diff).to.include(" Line 3");
    });

    it("should handle empty strings", () => {
      const diff1 = generateDiff("", "New content");
      expect(diff1).to.include("+New content");

      const diff2 = generateDiff("Old content", "");
      expect(diff2).to.include("-Old content");
    });

    it("should preserve empty lines in diff output", () => {
      const original = "Line 1\n\nLine 3\n\nLine 5";
      const modified = "Line 1\n\nLine 3 modified\n\nLine 5";
      const diff = generateDiff(original, modified);

      // The diff should show the empty lines as unchanged
      const lines = diff.split("\n");

      // Count the number of lines that are empty with space prefix (unchanged empty lines)
      const unchangedEmptyLines = lines.filter((line) => line === " ").length;
      expect(unchangedEmptyLines).to.be.greaterThan(0, "Diff should preserve empty lines");

      // Also check that the modified line is shown
      expect(diff).to.include("-Line 3");
      expect(diff).to.include("+Line 3 modified");
    });

    it("should not show false positives when content is identical", () => {
      const content = "Line 1\n\nLine 3\nLine 4\n\nLine 6";
      const diff = generateDiff(content, content);

      // When content is identical, all lines should have space prefix (unchanged)
      const lines = diff.split("\n").filter((line) => line.length > 0);
      const allUnchanged = lines.every((line) => line.startsWith(" "));
      expect(allUnchanged).to.be.true;
    });
  });
});
