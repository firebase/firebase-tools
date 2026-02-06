import { ExecutableDefinitionNode, Kind, OperationDefinitionNode } from "graphql";

interface Comment {
  text: string;
  startLine: number;
  endLine: number;
  endIndex: number;
  queryDoc?: OperationDefinitionNode;
}

export function findCommentsBlocks(text: string, operations: ExecutableDefinitionNode[]): Comment[] {
  // Find all line endings
  const lineEnds: number[] = [];
  let searchIndex: number = -1;
  while ((searchIndex = text.indexOf('\n', searchIndex + 1)) !== -1) {
    lineEnds.push(searchIndex);
  }
  lineEnds.push(text.length);

  // Find all lines that start with comments.
  const comments: Comment[] = [];
  for (let i = 0; i < lineEnds.length; i++) {
    const lineStart = i === 0 ? 0 : lineEnds[i - 1] + 1;
    const lineText = text.substring(lineStart, lineEnds[i]).trim();
    if (lineText.startsWith('#')) {
      comments.push({ startLine: i, endLine: i, text: lineText.substring(1).trim(), endIndex: lineEnds[i] });
    }
  }

  // Filter out comments that are inside operations
  const commentsOutsideOperations: Comment[] = [];
  let j = 0;
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const loc = op.loc!;
    const opStartLine = loc.startToken.line - 1;
    const opEndLine = loc.endToken.line - 1;
    for (; j < comments.length; j++) {
      const c = comments[j];
      if (c.endLine > opEndLine) {
        break;
      }
      if (c.endLine < opStartLine) {
        commentsOutsideOperations.push(c);
        if (c.endLine + 1 === opStartLine && op.kind === Kind.OPERATION_DEFINITION) {
          c.queryDoc = op;
        }
      } else {
        // Ignore comments inside operation
      }
    }
  }
  for (; j < comments.length; j++) {
    commentsOutsideOperations.push(comments[j]);
  }

  // Combine consecutive comment lines into multi-line blocks.
  const commentBlocks: Comment[] = [];
  for (let i = 0; i < commentsOutsideOperations.length; i++) {
    const current = commentsOutsideOperations[i];
    if (i === 0 || current.startLine > commentsOutsideOperations[i - 1].endLine + 1) {
      commentBlocks.push({ ...current });
    } else {
      // Continuation of the previous block
      const lastBlock = commentBlocks[commentBlocks.length - 1];
      lastBlock.endLine = current.endLine;
      lastBlock.endIndex = current.endIndex;
      lastBlock.text += '\n' + current.text;
      lastBlock.queryDoc = current.queryDoc;
    }
  }
  return commentBlocks;
}
