
interface Comment {
  text: string;
  startLine: number;
  endLine: number;
  endIndex: number;
}

export function findCommentsBlocks(text: string): Comment[] {
  const lineEnds: number[] = [];
  let searchIndex: number = -1;
  while ((searchIndex = text.indexOf('\n', searchIndex + 1)) !== -1) {
    lineEnds.push(searchIndex);
  }
  const comments: Comment[] = [];
  for (let i = 0; i < lineEnds.length; i++) {
    const lineStart = i === 0 ? 0 : lineEnds[i - 1] + 1;
    const lineText = text.substring(lineStart, lineEnds[i]).trim();
    if (lineText.startsWith('#')) {
      comments.push({ startLine: i, endLine: i, text: lineText.substring(1).trim(), endIndex: lineEnds[i] });
    }
  }
  const commentBlocks: Comment[] = [];
  for (let i = 0; i < comments.length; i++) {
    const current = comments[i];
    if (i === 0 || current.startLine > comments[i - 1].endLine + 1) {
      commentBlocks.push({ ...current });
    } else {
      // Continuation of the previous block
      const lastBlock = commentBlocks[commentBlocks.length - 1];
      lastBlock.endLine = current.endLine;
      lastBlock.endIndex = current.endIndex;
      lastBlock.text += '\n' + current.text;
    }
  }
  return commentBlocks;
}