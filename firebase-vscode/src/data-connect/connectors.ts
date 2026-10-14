import vscode, {
  Disposable,
  ExtensionContext,
  InputBoxValidationMessage,
  InputBoxValidationSeverity,
} from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import {
  ASTNode,
  ArgumentNode,
  ConstValueNode,
  DocumentNode,
  GraphQLInputType,
  GraphQLLeafType,
  GraphQLNonNull,
  IntrospectionQuery,
  Kind,
  NamedTypeNode,
  ObjectFieldNode,
  OperationDefinitionNode,
  Source,
  TypeInfo,
  TypeNode,
  VariableNode,
  buildClientSchema,
  isConstValueNode,
  isEnumType,
  isLeafType,
  isNonNullType,
  parse,
  print,
  separateOperations,
  visit,
  visitWithTypeInfo,
} from "graphql";
import { camelCase } from "lodash";
import { DataConnectService } from "./service";
import { OperationLocation } from "./types";
import { checkIfFileExists } from "./file-utils";
import * as path from "path";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../analytics";

export function registerConnectors(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  dataConnectService: DataConnectService,
  analyticsLogger: AnalyticsLogger,
): Disposable {
  async function moveOperationToConnector(
    defIndex: number, // The index of the definition to move.
    { documentPath, document }: OperationLocation,
    connectorPath: string,
  ) {
    const ast = parse(new Source(document, documentPath));

    const def = ast.definitions[defIndex];
    if (!def) {
      throw new Error(`definitions[${defIndex}] not found.`);
    }
    if (def.kind !== Kind.OPERATION_DEFINITION) {
      throw new Error(`definitions[${defIndex}] is not an operation.`);
    }
    const introspect = (await dataConnectService.introspect())?.data;
    if (!introspect) {
      vscode.window.showErrorMessage(
        "Failed to introspect the types. (Is the emulator running?)",
      );
      return;
    }
    const opKind = def.operation as string; // query or mutation

    let opName = def.name?.value;
    if (!opName || (await validateOpName(opName)) !== null) {
      opName = await vscode.window.showInputBox({
        title: `Pick a name for the ${opKind}`,
        placeHolder: `e.g. ${camelCase("my-" + opKind)}`,
        prompt: `Name of the ${opKind} (to be used with SDKs).`,
        value: opName || suggestOpName(def, documentPath),
        validateInput: validateOpName,
      });

      if (!opName) {
        return; // Dialog dismissed by the developer.
      }
    }

    // While `parse` above tolerates operations with duplicate names (or
    // multiple anonymous operations), `separateOperations` will misbehave.
    // So we reassign the names to be all unique just in case.
    let i = 0;
    const opAst = separateOperations(
      visit(ast, {
        OperationDefinition(node) {
          i++;
          return {
            ...node,
            name: {
              kind: Kind.NAME,
              value: node === def ? opName : `ignored${i}`,
            },
          };
        },
      }),
    )[opName];
    // opAst contains only the operation we care about plus fragments used.
    if (!opAst) {
      throw new Error("Error separating operations.");
    }

    const candidates = findExtractCandidates(opAst, introspect);

    const picked = await vscode.window.showQuickPick(candidates, {
      title: `Extract variables that can be modified by clients`,
      placeHolder: `(type to filter...)`,
      canPickMany: true,
      ignoreFocusOut: true,
    });

    if (!picked) {
      return; // Dialog dismissed by the developer.
    }

    const newAst = extractVariables(opAst, picked);
    const content = print(newAst);
    const filePath = getFilePath(opName);

    vscode.workspace
      .openTextDocument(filePath.with({ scheme: "untitled" }))
      .then((doc) => {
        vscode.window.showTextDocument(doc).then((openDoc) => {
          openDoc.edit((edit) => {
            edit.insert(new vscode.Position(0, 0), content);
          });
        });
      });

    // TODO: Consider removing the operation from the original document?

    vscode.window.showInformationMessage(
      `Moved ${opName} to ${vscode.workspace.asRelativePath(filePath)}`,
    );

    async function validateOpName(
      value: string,
    ): Promise<InputBoxValidationMessage | null> {
      if (!value) {
        return {
          severity: InputBoxValidationSeverity.Error,
          message: `A name is required for each ${opKind} in a connector.`,
        };
      }
      // TODO: Check if an operation with the same name exists in basePath.
      const fp = getFilePath(value);

      if (await checkIfFileExists(fp)) {
        return {
          // We're treating this as fatal under the assumption that the file may
          // contain an operation with the same name. Once we can actually rule
          // out naming conflicts above, we should handle this better, such as
          // appending to that file or choosing a different file like xxx2.gql.
          severity: InputBoxValidationSeverity.Error,
          message: `${vscode.workspace.asRelativePath(fp)} already exists.`,
        };
      }

      return {} as InputBoxValidationMessage;
    }

    function getFilePath(opName: string) {
      return vscode.Uri.file(path.join(connectorPath, `${opName}.gql`));
    }
  }

  function suggestOpName(ast: OperationDefinitionNode, documentPath: string) {
    if (documentPath) {
      // Suggest name from basename (e.g. /foo/bar/baz_quax.gql => bazQuax).
      const match = documentPath.match(/([^./\\]+)\./);
      if (match) {
        return camelCase(match[1]);
      }
    }
    for (const sel of ast.selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        // Suggest name from the first field (e.g. foo_insert => fooInsert).
        return camelCase(sel.name.value);
      }
    }
    return camelCase(`my-${ast.operation}-${Math.floor(Math.random() * 100)}`);
  }

  function findExtractCandidates(
    ast: DocumentNode,
    introspect: IntrospectionQuery,
  ): ExtractCandidate[] {
    const candidates: ExtractCandidate[] = [];
    const seenVarNames = new Set<string>();
    visit(ast, {
      VariableDefinition(node) {
        seenVarNames.add(node.variable.name.value);
      },
    });
    // TODO: Make this work for inline and non-inline fragments.
    const fieldPath: string[] = [];
    let directiveName: string | undefined = undefined;
    let argName: string | undefined = undefined;
    const valuePath: string[] = [];
    const schema = buildClientSchema(introspect, { assumeValid: true });
    const typeInfo = new TypeInfo(schema);
    // Visits operations as well as fragments.
    visit(
      ast,
      visitWithTypeInfo(typeInfo, {
        VariableDefinition() {
          // Do not extract literals in variable default values or directives.
          return false;
        },
        Directive: {
          enter(node) {
            if (node.name.value === "auth") {
              // Auth should not be modifiable by clients.
              return false;
            }
            // @skip(if: $boolVar) and @include(if: $boolVar) are actually good
            // targets to extract. We may want to revisit when Data Connect adds more
            // field-level directives.
            directiveName = node.name.value;
          },
          leave() {
            directiveName = undefined;
          },
        },
        Field: {
          enter(node) {
            fieldPath.push((node.alias ?? node.name).value);
          },
          leave() {
            fieldPath.pop();
          },
        },
        Argument: {
          enter(node) {
            if (argName) {
              // This should be impossible to reach.
              throw new Error(
                `Found Argument within Argument: (${argName} > ${node.name.value}).`,
              );
            }
            argName = node.name.value;
            const arg = typeInfo.getArgument();
            if (!arg) {
              throw new Error(
                `Cannot resolve argument type for ${displayPath(
                  fieldPath,
                  directiveName,
                  argName,
                )}.`,
              );
            }
            if (addCandidate(node, arg.type)) {
              argName = undefined;
              return false; // Skip extracting parts of this argument.
            }
          },
          leave() {
            argName = undefined;
          },
        },
        ObjectField: {
          enter(node) {
            valuePath.push(node.name.value);
            const input = typeInfo.getInputType();
            if (!input) {
              // This may happen if a scalar (such as JSON) type has a value of
              // a nested structure (objects / lists). We cannot infer the
              // actual required "type" of the sub-structure in this case.
              return false;
            }
            if (addCandidate(node, input)) {
              valuePath.pop();
              return false; // Skip extracting fields within this object.
            }
          },
          leave() {
            valuePath.pop();
          },
        },
        ListValue: {
          enter() {
            // We don't know how to extract repeated variables yet.
            // Exception: A key scalar may be extracted as a whole even if its
            // value is in array format. Those cases are handled by the scalar
            // checks in Argument and ObjectField and should never reach here.
            return false;
          },
        },
      }),
    );
    return candidates;

    function addCandidate(
      node: ObjectFieldNode | ArgumentNode,
      type: GraphQLInputType,
    ): boolean {
      if (!isConstValueNode(node.value)) {
        return false;
      }
      if (!isExtractableType(type)) {
        return false;
      }
      const varName = suggestVarName(
        seenVarNames,
        fieldPath,
        directiveName,
        argName,
        valuePath,
      );
      seenVarNames.add(varName);
      candidates.push({
        defaultValue: node.value,
        parentNode: node,
        varName,
        type,
        label: "$" + varName,
        description: `: ${type} = ${print(node.value)}`,
        detail: displayPath(
          fieldPath,
          directiveName,
          argName,
          valuePath,
          "$" + varName,
        ),
        // Typical enums such as OrderBy are unlikely to be made variables.
        // Similarly, null literals aren't usually meant to be changed.
        picked: !isEnumType(type) && node.value.kind !== Kind.NULL,
      });
      return true;
    }
  }

  function extractVariables(
    opAst: DocumentNode,
    picked: ExtractCandidate[],
  ): DocumentNode {
    const pickedByParent = new Map<ASTNode, ExtractCandidate>();
    for (const p of picked) {
      pickedByParent.set(p.parentNode, p);
    }

    return visit(opAst, {
      enter(node) {
        const extract = pickedByParent.get(node);
        if (extract) {
          const newVal: VariableNode = {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: extract.varName,
            },
          };
          return { ...node, value: newVal };
        }
      },
      OperationDefinition: {
        leave(node) {
          const variableDefinitions = [...node.variableDefinitions!];
          for (const extract of picked) {
            variableDefinitions.push({
              kind: Kind.VARIABLE_DEFINITION,
              variable: {
                kind: Kind.VARIABLE,
                name: {
                  kind: Kind.NAME,
                  value: extract.varName,
                },
              },
              defaultValue:
                extract.defaultValue.kind === Kind.NULL
                  ? undefined // Omit `= null`.
                  : extract.defaultValue,
              type: toTypeNode(extract.type),
            });
          }
          const directives = [...node.directives!];
          directives.push({
            kind: Kind.DIRECTIVE,
            name: {
              kind: Kind.NAME,
              value: "auth",
            },
            arguments: [
              {
                kind: Kind.ARGUMENT,
                name: {
                  kind: Kind.NAME,
                  value: "level",
                },
                value: {
                  kind: Kind.ENUM,
                  value: "PUBLIC",
                },
              },
            ],
          });
          return { ...node, variableDefinitions, directives };
        },
      },
    });
  }

  function displayPath(
    fieldPath: string[],
    directiveName?: string,
    argName?: string,
    valuePath?: string[],
    valueDisp = "<value>",
  ): string {
    let fieldDisp = fieldPath.join(".");
    if (directiveName) {
      fieldDisp += ` @${directiveName}`;
    }
    if (!argName) {
      return fieldDisp;
    }
    if (valuePath) {
      // <value> or {foo: <value>} or {parent: {foo: <value>}} or so on.
      for (let i = valuePath.length - 1; i >= 0; i--) {
        valueDisp = `{${valuePath[i]}: ${valueDisp}}`;
      }
      valueDisp = " " + valueDisp;
    } else {
      valueDisp = "";
    }
    return fieldDisp + `(${argName}:${valueDisp})`;
  }

  function suggestVarName(
    seenVarNames: Set<string>,
    fieldPath: string[],
    directiveName?: string,
    argName?: string,
    valuePath?: string[],
  ): string {
    const path = [...fieldPath];
    if (argName) {
      path.push(argName);
    }
    if (directiveName) {
      path.push(directiveName);
    }
    if (valuePath) {
      path.push(...valuePath);
    }
    // Consider all path segments (starting from the local name) and keep adding
    // more prefixes or numbers. e.g., for `foo_insert(data: {id: <value>})`:
    // $id => $dataId => $fooInsertDataId => $fooInsertDataId2, in that order.
    let varName = path[path.length - 1];
    for (let i = path.length - 2; i >= 0; i--) {
      if (seenVarNames.has(varName)) {
        varName = camelCase(`${path[i]}-${varName}`);
      }
    }
    if (seenVarNames.has(varName)) {
      for (let i = 2; i < 100; i++) {
        if (!seenVarNames.has(varName + i.toString())) {
          varName += i.toString();
          break;
        }
      }
      // In the extremely rare case, we may reach here and the variable name
      // may be already taken and we'll let the developer resolve this problem.
    }
    return varName;
  }

  return Disposable.from(
    vscode.commands.registerCommand(
      "firebase.dataConnect.moveOperationToConnector",
      (number, location, connectorPath) => {
        analyticsLogger.logger.logUsage(
          DATA_CONNECT_EVENT_NAME.MOVE_TO_CONNECTOR,
        );
        moveOperationToConnector(number, location, connectorPath);
      },
    ),
  );
}

interface ExtractCandidate extends vscode.QuickPickItem {
  defaultValue: ConstValueNode;
  parentNode: ArgumentNode | ObjectFieldNode;
  varName: string;
  type: ExtractableType;
}

type ExtractableType = GraphQLLeafType | GraphQLNonNull<GraphQLLeafType>;

function isExtractableType(type: unknown): type is ExtractableType {
  if (isNonNullType(type)) {
    type = type.ofType;
  }
  if (isLeafType(type)) {
    return true;
  }
  return false;
}

function toTypeNode(type: ExtractableType): TypeNode {
  if (isNonNullType(type)) {
    return {
      kind: Kind.NON_NULL_TYPE,
      type: toNamedTypeNode(type.ofType),
    };
  }
  return toNamedTypeNode(type);
}

function toNamedTypeNode(type: GraphQLLeafType): NamedTypeNode {
  return {
    kind: Kind.NAMED_TYPE,
    name: {
      kind: Kind.NAME,
      value: type.name,
    },
  };
}
