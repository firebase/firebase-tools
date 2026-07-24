import * as vscode from "vscode";
import { Kind, OperationDefinitionNode, parse } from "graphql";
import {
  AllowDirectiveService,
  AllowableField,
} from "./allow-directive-service";
import { dataConnectConfigs } from "./config";
import { unwrapTypeName } from "../utils/graphql";

interface AllowFieldsContext {
  fieldsText: string;
  stringStartOffset: number;
}

interface FieldsParseResult {
  listedFields: string[];
  partial: string;
  nestingOnField?: string;
}

/** Autocomplete provider for fields inside @allow(fields: "...") strings. */
export class AllowDirectiveCompletionProvider
  implements vscode.CompletionItemProvider {
  constructor(private allowService: AllowDirectiveService) { }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    const context = this.findAllowFieldsContext(document, position);
    if (!context) {
      return undefined;
    }

    const dataTypeName = this.findDataTypeName(document, position);
    if (!dataTypeName) {
      return undefined;
    }

    const configs = dataConnectConfigs.value?.tryReadValue;
    if (!configs) {
      return undefined;
    }
    try {
      this.allowService.initialize(
        configs.findEnclosingServiceForPath(document.fileName),
      );
    } catch {
      return undefined;
    }

    if (!this.allowService.hasDataType(dataTypeName)) {
      return undefined;
    }

    const parsed = parseFieldsText(context.fieldsText);
    return this.resolveCandidates(dataTypeName, parsed).map((field) =>
      toCompletionItem(field),
    );
  }

  /** Detect if cursor is inside an @allow(fields: "...") string. */
  private findAllowFieldsContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): AllowFieldsContext | null {
    const textUpToCursor = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position),
    );

    const pattern = /@allow\s*\(\s*fields\s*:\s*"/g;
    let match: RegExpExecArray | null;
    let lastMatch: RegExpExecArray | null = null;
    while ((match = pattern.exec(textUpToCursor)) !== null) {
      lastMatch = match;
    }
    if (!lastMatch) {
      return null;
    }

    const stringStart = lastMatch.index + lastMatch[0].length;
    const textInsideQuotes = textUpToCursor.substring(stringStart);

    // Cursor is past the closing quote — not inside the string.
    if (textInsideQuotes.includes('"')) {
      return null;
    }

    return { fieldsText: textInsideQuotes, stringStartOffset: stringStart };
  }

  /** Find the _Data type from the enclosing operation's variables. */
  private findDataTypeName(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): string | null {
    let ast;
    try {
      ast = parse(document.getText());
    } catch {
      return this.findDataTypeNameByRegex(document, position);
    }

    const offset = document.offsetAt(position);
    for (const def of ast.definitions) {
      if (def.kind !== Kind.OPERATION_DEFINITION || !def.loc) {
        continue;
      }
      if (offset >= def.loc.start && offset <= def.loc.end) {
        return findDataTypeFromOperation(def);
      }
    }
    return null;
  }

  /** Regex fallback when the document can't be parsed. */
  private findDataTypeNameByRegex(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): string | null {
    const text = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position),
    );
    const pattern = /\$\w+\s*:\s*\[?(\w+_Data)\s*!?\]?\s*!?/g;
    let match: RegExpExecArray | null;
    let lastMatch: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) {
      lastMatch = match;
    }
    return lastMatch?.[1] ?? null;
  }

  private resolveCandidates(
    dataTypeName: string,
    parsed: FieldsParseResult,
  ): AllowableField[] {
    let typeName = dataTypeName;
    let nestedOnFieldName: string | undefined;

    if (parsed.nestingOnField) {
      const onField = this.allowService
        .getFieldCandidates(dataTypeName)
        .find((f) => f.name === parsed.nestingOnField);
      if (!onField?.childDataTypeName) {
        return [];
      }
      typeName = onField.childDataTypeName;
      nestedOnFieldName = parsed.nestingOnField;
    }

    const listed = new Set(parsed.listedFields);
    return this.allowService
      .getFieldCandidates(typeName, nestedOnFieldName)
      .filter(
        (f) =>
          !listed.has(f.name) &&
          f.name.toLowerCase().startsWith(parsed.partial.toLowerCase()),
      );
  }
}

function toCompletionItem(field: AllowableField): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    field.name,
    field.isRelational
      ? vscode.CompletionItemKind.Module
      : vscode.CompletionItemKind.Field,
  );
  item.detail = field.typeName;
  if (field.description) {
    item.documentation = new vscode.MarkdownString(field.description);
  }
  if (field.isRelational) {
    item.insertText = new vscode.SnippetString(`${field.name} { $0 }`);
    item.command = {
      command: "editor.action.triggerSuggest",
      title: "Trigger Suggest",
    };
  }
  item.sortText = field.isRelational ? `z_${field.name}` : field.name;
  return item;
}

/**
 * Tokenize the text inside @allow(fields: "...") up to the cursor.
 * Tracks { } nesting to determine listed fields, partial word, and nesting context.
 *
 * Example: "userId notes_on_app { tex"
 * → { listedFields: [], partial: "tex", nestingOnField: "notes_on_app" }
 */
export function parseFieldsText(text: string): FieldsParseResult {
  const tokens = text.match(/[_A-Za-z][_0-9A-Za-z]*|[{}]/g) || [];

  let depth = 0;
  const topLevelFields: string[] = [];
  const nestedFields: string[] = [];
  let lastOnField: string | undefined;
  let currentOnField: string | undefined;

  for (const token of tokens) {
    if (token === "{") {
      depth++;
      currentOnField = lastOnField;
      continue;
    }
    if (token === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        currentOnField = undefined;
      }
      continue;
    }
    if (depth === 0) {
      topLevelFields.push(token);
      if (token.includes("_on_")) {
        lastOnField = token;
      }
    } else {
      nestedFields.push(token);
    }
  }

  const lastChar = text[text.length - 1];
  const endsClean =
    !text.length || lastChar === " " || lastChar === "{" || lastChar === "}";

  if (depth > 0) {
    const partial = endsClean ? "" : nestedFields.pop() ?? "";
    return { listedFields: nestedFields, partial, nestingOnField: currentOnField };
  }
  const partial = endsClean ? "" : topLevelFields.pop() ?? "";
  return { listedFields: topLevelFields, partial, nestingOnField: undefined };
}

function findDataTypeFromOperation(
  def: OperationDefinitionNode,
): string | null {
  for (const varDef of def.variableDefinitions ?? []) {
    const typeName = unwrapTypeName(varDef.type);
    if (typeName.endsWith("_Data")) {
      return typeName;
    }
  }
  return null;
}
