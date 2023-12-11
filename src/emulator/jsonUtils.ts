type MatchingBracketsAccumulator = {
  matching: "none" | "square" | "curly";
  squareUnclosed: number;
  curlyUnclosed: number;
  matches: number[];
  escapes: number;
  isString: boolean;
};

const merge = (
  j1: MatchingBracketsAccumulator,
  j2: MatchingBracketsAccumulator
): MatchingBracketsAccumulator => ({
  matching: j2.matching,
  curlyUnclosed: j1.curlyUnclosed + j2.curlyUnclosed,
  squareUnclosed: j1.squareUnclosed + j2.squareUnclosed,
  escapes: j1.escapes + j2.escapes,
  matches: [...j1.matches, ...j2.matches],
  isString: j2.isString,
});
const defaultMatchingBrackets: MatchingBracketsAccumulator = {
  matching: "none",
  escapes: 0,
  matches: [0],
  curlyUnclosed: 0,
  squareUnclosed: 0,
  isString: false,
};

const _getCountScore = (isEscaped: boolean, char: string) => (inc: string, dec: string) =>
  isEscaped ? 0 : inc === char ? 1 : dec === char ? -1 : 0;

const getMatchingBracketIndices = (s: string): number[] => {
  const res = s.split("").reduce((acc, c, index) => {
    const isEscaped = acc.escapes % 2 === 1;
    const isString = !isEscaped && c === '"' ? !acc.isString : acc.isString;
    const getCountScore = _getCountScore(isEscaped || isString, c);
    const curlyUnclosed = getCountScore("{", "}");
    const squareUnclosed = getCountScore("[", "]");
    const completedMatch =
      (acc.matching === "curly" && acc.curlyUnclosed + curlyUnclosed === 0) ||
      (acc.matching === "square" && acc.squareUnclosed + squareUnclosed === 0);
    const matching = completedMatch
      ? "none"
      : acc.matching === "none" && curlyUnclosed === 1
      ? "curly"
      : acc.matching === "none" && squareUnclosed === 1
      ? "square"
      : acc.matching;

    const res = merge(acc, {
      escapes: c === "\\" ? 1 : -1 * acc.escapes,
      curlyUnclosed,
      matching,
      matches: completedMatch
        ? [index + 1]
        : acc.matching === "none" && matching !== "none"
        ? [index]
        : [],
      squareUnclosed,
      isString,
    });
    return res;
  }, defaultMatchingBrackets);
  return res.matches;
};

type ParseError = { type: "parse-error"; value: string };
const parseError = (value: string): ParseError => ({ type: "parse-error", value });
type ParseSuccess = { type: "success"; value: object };
const parseSuccess = (value: object): ParseSuccess => ({ type: "success", value });
type ParseResponse = ParseError | ParseSuccess;

export const parseStr = (s: string): ParseResponse[] => {
  const indices = getMatchingBracketIndices(s);
  return indices
    .map((start, index) => {
      const finish = indices[index + 1] ?? s.length;
      const strObj = s.slice(start, finish);
      try {
        const value: object = JSON.parse(strObj);
        return parseSuccess(value);
      } catch (error) {
        return parseError(strObj);
      }
    })
    .filter((v) => v.type === "success" || (v.type === "parse-error" && Boolean(v.value)));
};
