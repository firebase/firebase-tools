import * as vscode from "vscode"; // from //third_party/vscode/src/vs:vscode
import { CancellationToken, ExtensionContext } from "vscode";

import {
  IntrospectionQuery,
  IntrospectionType,
  IntrospectionOutputType,
  IntrospectionNamedTypeRef,
  IntrospectionOutputTypeRef,
  IntrospectionField,
  TypeKind,
} from "graphql";
import { effect } from "@preact/signals-core";
import { introspectionQuery } from "./explorer";
import { OPERATION_TYPE } from "./types";

interface Element {
  name: string;
  baseType: OPERATION_TYPE;
}

export class ExplorerTreeDataProvider
  implements vscode.TreeDataProvider<Element>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<Element | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private typeSystem:
    | {
        introspection: IntrospectionQuery;
        typeForName: Map<string, IntrospectionType>;
      }
    | undefined = undefined;

  constructor() {
    // on introspection change, update typesystem
    effect(() => {
      const introspection = introspectionQuery.value;
      if (introspection) {
        const typeForName = new Map<string, IntrospectionType>();
        for (const type of introspection.__schema.types) {
          typeForName.set(type.name, type);
        }
        this.typeSystem = {
          introspection,
          typeForName,
        };
        this.refresh();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  // sort by whether the element has children, so that list items show up last
  private eleSortFn = (a: Element, b: Element) => {
    const a_field = this._field(a);
    const b_field = this._field(b);
    const isAList = a_field?.type.kind === TypeKind.OBJECT;
    const isBList = b_field?.type.kind === TypeKind.OBJECT;
    if ((isAList && isBList) || (!isAList && !isBList)) {
      return 0;
    } else if (isAList) {
      return 1;
    } else {
      return -1;
    }
  };

  getTreeItem(element: Element): vscode.TreeItem {
    // special cases for query and mutation root folders
    if (
      Object.values(OPERATION_TYPE).includes(element.name as OPERATION_TYPE)
    ) {
      return new vscode.TreeItem(
        element.name,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
    }

    const field = this._field(element);
    if (!field) {
      throw new Error(`Expected field ${element} to be defined but was not.`);
    }

    const hasChildren = this._baseType(field).kind === TypeKind.OBJECT;
    const label = field.name;
    const treeItem = new vscode.TreeItem(
      label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    treeItem.description = this._formatType(field.type);
    return treeItem;
  }

  getChildren(element?: Element): Element[] {
    // if the backend did not load yet
    if (!introspectionQuery.value || !this.typeSystem) {
      return [];
    }
    // init the tree with two elements, query and mutation
    if (!element) {
      return [
        { name: OPERATION_TYPE.query, baseType: OPERATION_TYPE.query },
        { name: OPERATION_TYPE.mutation, baseType: OPERATION_TYPE.mutation },
      ];
    }

    if (element.name === OPERATION_TYPE.query) {
      return this._unref(this.typeSystem.introspection.__schema.queryType)
        .fields.filter((f) => f.name !== "_firebase")
        .map((f) => {
          return { name: f.name, baseType: OPERATION_TYPE.query };
        });
    } else if (element.name === OPERATION_TYPE.mutation) {
      return this._unref(this.typeSystem.introspection.__schema.mutationType!)
        .fields.filter((f) => f.name !== "_firebase")
        .map((f) => {
          return { name: f.name, baseType: OPERATION_TYPE.mutation };
        });
    }
    const field = this._field(element);
    if (field) {
      const unwrapped = this._baseType(field);
      const type = this._unref(unwrapped);
      if (type.kind === TypeKind.OBJECT) {
        return type.fields
          .map((field) => {
            return {
              name: `${element.name}.${field.name}`,
              baseType: element.baseType,
            };
          })
          .sort(this.eleSortFn);
      }
    }
    return [];
  }

  getParent(element: Element): vscode.ProviderResult<Element | undefined> {
    const lastDot = element.name.indexOf(".");
    if (lastDot <= 0) {
      return undefined;
    }
    return {
      name: element.name.substring(0, lastDot),
      baseType: element.baseType,
    };
  }

  resolveTreeItem(
    item: vscode.TreeItem,
    element: Element,
    token: CancellationToken,
  ): vscode.ProviderResult<vscode.TreeItem> {
    const field = this._field(element);
    item.tooltip =
      field && field.description
        ? new vscode.MarkdownString(field.description)
        : "";

    return item;
  }

  private _field(element: Element): IntrospectionField | undefined {
    const path = element.name.split(".");
    const typeRef =
      element.baseType === OPERATION_TYPE.query
        ? this.typeSystem!.introspection.__schema.queryType
        : this.typeSystem!.introspection.__schema.mutationType;

    if (!path.length) {
      return undefined;
    }
    let field = undefined;
    for (let i = 0; i < path.length; i++) {
      const baseTypeRef: any = i === 0 ? typeRef : this._baseType(field!);

      const type = this._unref(baseTypeRef);
      if (type.kind !== TypeKind.OBJECT) {
        return undefined;
      }
      const maybeField = type.fields.find((f) => f.name === path[i]);
      if (!maybeField) {
        return undefined;
      }
      field = maybeField;
    }
    return field;
  }

  _unref<T extends IntrospectionType>(ref: IntrospectionNamedTypeRef<T>): T {
    const type = this.typeSystem!.typeForName.get(ref.name);
    if (!type) {
      throw new Error(
        `Introspection invariant violation: Ref type ${ref.name} does not exist`,
      );
    }
    if (ref.kind && type.kind !== ref.kind) {
      throw new Error(
        `Introspection invariant violation: Ref kind ${ref.kind} does not match Type kind ${type.kind}`,
      );
    }
    return type as T;
  }

  _baseType(
    field: IntrospectionField,
  ): IntrospectionNamedTypeRef<IntrospectionOutputType> {
    let unwrapped = field.type;
    while (
      unwrapped.kind === TypeKind.NON_NULL ||
      unwrapped.kind === TypeKind.LIST
    ) {
      unwrapped = unwrapped.ofType;
    }
    return unwrapped;
  }

  _formatType(type: IntrospectionOutputTypeRef): string {
    if (type.kind === TypeKind.NON_NULL) {
      return this._formatType(type.ofType) + "!";
    }
    if (type.kind === TypeKind.LIST) {
      return `[${this._formatType(type.ofType)}]`;
    }
    return type.name;
  }
}
