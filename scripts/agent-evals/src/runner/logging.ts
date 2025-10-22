const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  BLUE: "\x1b[34m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
};

function colorLog(color: string, message: string): void {
  console.log(`${color}${message}${COLORS.RESET}`);
}

export function throwFailure(message: string) {
  // Log this separately because mocha doesn't print errors from failures
  // that happen before the final repetition. The failure can be helpful to get
  // early signal that the test is going to fail all reptitions
  colorLog(COLORS.BRIGHT + COLORS.RED, message);
  throw new Error(message);
}
