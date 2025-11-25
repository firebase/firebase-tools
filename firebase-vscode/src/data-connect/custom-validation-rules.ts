
import { GraphQLError, ValidationRule } from "graphql";

export const NoUnusedVariablesInCheckDirective: ValidationRule = (context) => {
  return {
    OperationDefinition(node) {
      const definedVariables = new Set(
        node.variableDefinitions?.map((def) => def.variable.name.value)
      );
      const usedVariables = new Set<string>();

      context.getDocument().definitions.forEach((definition) => {
        if (definition.kind === "OperationDefinition") {
          definition.selectionSet.selections.forEach((selection) => {
            if (selection.kind === "Field") {
              selection.selectionSet?.selections.forEach((fieldSelection) => {
                if (
                  fieldSelection.kind === "Field" &&
                  fieldSelection.directives
                ) {
                  fieldSelection.directives.forEach((directive) => {
                    if (directive.name.value === "check") {
                      directive.arguments?.forEach((argument) => {
                        if (
                          argument.value.kind === "StringValue" &&
                          definedVariables.has(argument.value.value)
                        ) {
                          usedVariables.add(argument.value.value);
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });

      for (const variable of definedVariables) {
        if (!usedVariables.has(variable)) {
          context.reportError(
            new GraphQLError(`Variable "$${variable}" is not used.`, node)
          );
        }
      }
    },
  };
};
