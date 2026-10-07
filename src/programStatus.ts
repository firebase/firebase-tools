import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as util from "node:util";
import { detectAIAgent, isFirebaseMcp } from "./env";
import { isVSCodeExtension } from "./vsCodeUtils";

export type ProgramState = "idle" | "working" | "done" | "blocked" | "error" | "clear";
export type BlockedKind = "permission" | "question" | "auth";

export interface ProgramStatusReport {
  state: ProgramState;
  id?: string;
  kind?: BlockedKind;
  progress?: number;
  app?: string;
  title?: string;
  msg?: string;
}

export interface WorkingContext {
  msg: string;
  progress?: number;
}

export interface DetectSupportOptions {
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  timeoutMs?: number;
  terminfoDirs?: readonly string[];
}

const OSC_PREFIX = "\x1b]7501;";
const OSC_ST = "\x1b\\";
const FEATURE_DETECT_QUERY = "\x1b]7501;?\x1b\\\x1b[c";
const DEFAULT_APP = "firebase";

const MAX_SEQUENCE_BYTES = 4096;
const MAX_MSG_DECODED_BYTES = 2048;
const MAX_TITLE_DECODED_BYTES = 192;
const MAX_APP_BYTES = 32;
const MAX_ID_BYTES = 128;
const MAX_ID_SEGMENT_BYTES = 32;
const MAX_ID_DEPTH = 8;
const DEFAULT_DETECT_TIMEOUT_MS = 50;

const VALID_STATES: readonly ProgramState[] = [
  "idle",
  "working",
  "done",
  "blocked",
  "error",
  "clear",
];
const VALID_KINDS: readonly BlockedKind[] = ["permission", "question", "auth"];
const VALID_SEGMENT_CHARS_REGEX = /^[A-Za-z0-9_.+-]+$/;
const INVALID_SEGMENT_CHARS_REGEX = /[^A-Za-z0-9_.+-]+/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f-\u009f]/g;
const MULTILINE_WHITESPACE_REGEX = /[\r\n\t]+/g;

// Matches OSC 7501 feature detection reply: ESC ] 7501 ; ? [optional pairs] (ESC \ | BEL)
// eslint-disable-next-line no-control-regex
const OSC_7501_REPLY_REGEX = /\x1b\]7501;\?[^\x07\x1b]*(?:\x1b\\|\x07)/;
// Matches Primary Device Attributes (DA1) reply: ESC [ ? ... c
// eslint-disable-next-line no-control-regex
const DA1_REPLY_REGEX = /\x1b\[\?[0-9;]*c/;

const TERMINFO_CAP_NAME = Buffer.from("Pst\0", "utf8");
const TERMINFO_CAP_MARKER = Buffer.from("7501;", "utf8");

const USER_CANCEL_MESSAGES: readonly string[] = [
  "Command aborted.",
  "Deployment canceled.",
  "Aborted by user.",
];

let supportDetected: boolean | undefined;
let detectionPromise: Promise<boolean> | undefined;
let workingStack: WorkingContext[] = [];
let userInterrupted = false;
let hasActiveChildRecords = false;

/**
 * Truncates a UTF-8 string to at most `maxBytes` bytes without splitting
 * multi-byte UTF-8 codepoints.
 */
function truncateUtf8(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, "utf8");
  if (buf.length <= maxBytes) {
    return str;
  }
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0b1100_0000) === 0b1000_0000) {
    end--;
  }
  return buf.subarray(0, end).toString("utf8");
}

/**
 * Strips ANSI/VT escape sequences and control characters from free-text values
 * (`msg` and `title`) and truncates to the decoded UTF-8 byte limit.
 */
export function sanitizeFreeText(text: string, maxBytes: number): string {
  if (!text) {
    return "";
  }
  const withoutAnsi = util.stripVTControlCharacters(text);
  const singleLine = withoutAnsi.replace(MULTILINE_WHITESPACE_REGEX, " ");
  const withoutControls = singleLine.replace(CONTROL_CHARS_REGEX, "").trim();
  if (!withoutControls) {
    return "";
  }
  return truncateUtf8(withoutControls, maxBytes);
}

/**
 * Encodes free-text (`msg` or `title`) as standard base64 UTF-8 after sanitizing
 * and enforcing decoded byte limits.
 */
export function encodeBase64Text(text: string, maxDecodedBytes: number): string {
  const sanitized = sanitizeFreeText(text, maxDecodedBytes);
  if (!sanitized) {
    return "";
  }
  return Buffer.from(sanitized, "utf8").toString("base64");
}

/**
 * Sanitizes a record `id` path to conform to the OSC 7501 grammar:
 * `id := segment ("/" segment)*`, `segment := [A-Za-z0-9_.+-]{1,32}`,
 * max 8 levels deep and 128 bytes total.
 */
export function sanitizeId(rawId: string): string | undefined {
  if (!rawId) {
    return undefined;
  }
  const rawSegments = rawId.split("/").filter(Boolean).slice(0, MAX_ID_DEPTH);
  if (rawSegments.length === 0) {
    return undefined;
  }

  const sanitizedSegments: string[] = [];
  let totalBytes = 0;

  for (const rawSeg of rawSegments) {
    const cleaned = rawSeg
      .replace(INVALID_SEGMENT_CHARS_REGEX, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_ID_SEGMENT_BYTES);
    if (!cleaned) {
      continue;
    }
    const additionalBytes = (sanitizedSegments.length > 0 ? 1 : 0) + cleaned.length;
    if (totalBytes + additionalBytes > MAX_ID_BYTES) {
      break;
    }
    sanitizedSegments.push(cleaned);
    totalBytes += additionalBytes;
  }

  if (sanitizedSegments.length === 0) {
    return undefined;
  }
  return sanitizedSegments.join("/");
}

/**
 * Formats a `ProgramStatusReport` into an OSC 7501 escape sequence string.
 * Returns `undefined` if the report is invalid or exceeds protocol limits.
 */
export function formatReportSequence(report: ProgramStatusReport): string | undefined {
  if (!VALID_STATES.includes(report.state)) {
    return undefined;
  }

  const pairs: string[] = [`state=${report.state}`];

  if (report.id !== undefined) {
    const cleanId = sanitizeId(report.id);
    if (!cleanId) {
      return undefined;
    }
    pairs.push(`id=${cleanId}`);
  }

  if (report.state === "clear") {
    const seq = `${OSC_PREFIX}${pairs.join(":")}${OSC_ST}`;
    return Buffer.byteLength(seq, "utf8") <= MAX_SEQUENCE_BYTES ? seq : undefined;
  }

  if (report.state === "blocked" && report.kind && VALID_KINDS.includes(report.kind)) {
    pairs.push(`kind=${report.kind}`);
  }

  if (
    (report.state === "working" || report.state === "blocked") &&
    typeof report.progress === "number" &&
    Number.isFinite(report.progress)
  ) {
    const clamped = Math.max(0, Math.min(100, Math.round(report.progress)));
    pairs.push(`progress=${clamped}`);
  }

  const appValue = report.app ?? (report.id === undefined ? DEFAULT_APP : undefined);
  if (appValue) {
    const cleanApp = appValue.slice(0, MAX_APP_BYTES);
    if (VALID_SEGMENT_CHARS_REGEX.test(cleanApp)) {
      pairs.push(`app=${cleanApp}`);
    }
  }

  if (report.title) {
    const encodedTitle = encodeBase64Text(report.title, MAX_TITLE_DECODED_BYTES);
    if (encodedTitle) {
      pairs.push(`title=${encodedTitle}`);
    }
  }

  if (report.msg) {
    const encodedMsg = encodeBase64Text(report.msg, MAX_MSG_DECODED_BYTES);
    if (encodedMsg) {
      pairs.push(`msg=${encodedMsg}`);
    }
  }

  const seq = `${OSC_PREFIX}${pairs.join(":")}${OSC_ST}`;
  if (Buffer.byteLength(seq, "utf8") > MAX_SEQUENCE_BYTES) {
    return undefined;
  }
  return seq;
}

/**
 * Checks compiled terminfo files on disk for the `Pst` extended capability
 * without spawning any external subprocesses.
 */
export function hasTerminfoPstCapability(
  term: string | undefined = process.env.TERM,
  customDirs?: readonly string[],
): boolean {
  if (!term || !VALID_SEGMENT_CHARS_REGEX.test(term)) {
    return false;
  }

  const dirs: string[] = [];
  if (customDirs) {
    dirs.push(...customDirs);
  } else {
    if (process.env.TERMINFO) {
      dirs.push(process.env.TERMINFO);
    }
    try {
      dirs.push(path.join(os.homedir(), ".terminfo"));
    } catch {
      // Ignore homedir resolution errors.
    }
    if (process.env.TERMINFO_DIRS) {
      for (const dir of process.env.TERMINFO_DIRS.split(":")) {
        if (dir) {
          dirs.push(dir);
        }
      }
    }
    dirs.push("/etc/terminfo", "/lib/terminfo", "/usr/share/terminfo");
  }

  const firstChar = term[0];
  const hexSubdir = firstChar.charCodeAt(0).toString(16);
  const subdirs = [firstChar, hexSubdir];

  for (const baseDir of dirs) {
    for (const sub of subdirs) {
      const candidate = path.join(baseDir, sub, term);
      try {
        const data = fs.readFileSync(candidate);
        if (data.includes(TERMINFO_CAP_NAME) && data.includes(TERMINFO_CAP_MARKER)) {
          return true;
        }
      } catch {
        // Ignore missing or unreadable terminfo files.
      }
    }
  }

  return false;
}

function isEnvironmentEligible(stderr: NodeJS.WriteStream): boolean {
  if (!process.env.IS_FIREBASE_CLI) {
    return false;
  }
  if (
    process.env.FIREBASE_CLI_NO_PROGRAM_STATUS === "true" ||
    process.env.FIREBASE_CLI_NO_PROGRAM_STATUS === "1"
  ) {
    return false;
  }
  if (!stderr.isTTY) {
    return false;
  }
  if (process.env.TERM === "dumb") {
    return false;
  }
  if (
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITHUB_ACTION_REPOSITORY === "FirebaseExtended/action-hosting-deploy"
  ) {
    return false;
  }
  if (isFirebaseMcp() || isVSCodeExtension() || detectAIAgent() !== "unknown") {
    return false;
  }
  return true;
}

/**
 * Overrides or resets cached Program Status Protocol support state.
 */
export function setProgramStatusSupported(supported: boolean | undefined): void {
  supportDetected = supported;
  detectionPromise = undefined;
}

/**
 * Returns whether the current terminal supports OSC 7501.
 */
export function isProgramStatusSupported(): boolean {
  return supportDetected === true;
}

/**
 * Resets all module state for unit test isolation.
 */
export function resetProgramStatusState(): void {
  supportDetected = undefined;
  detectionPromise = undefined;
  workingStack = [];
  userInterrupted = false;
  hasActiveChildRecords = false;
}

/**
 * Probes the terminal for Program Status Protocol support using the `Pst`
 * terminfo fast-path or `OSC 7501 ; ? ST` followed by Primary Device Attributes (`CSI c`).
 */
export async function detectProgramStatusSupport(
  options: DetectSupportOptions = {},
): Promise<boolean> {
  if (supportDetected !== undefined) {
    return supportDetected;
  }
  if (detectionPromise) {
    return detectionPromise;
  }

  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DETECT_TIMEOUT_MS;

  if (!isEnvironmentEligible(stderr)) {
    supportDetected = false;
    return false;
  }

  if (
    process.env.FIREBASE_PROGRAM_STATUS === "true" ||
    process.env.FIREBASE_PROGRAM_STATUS === "1"
  ) {
    supportDetected = true;
    return true;
  }

  if (hasTerminfoPstCapability(process.env.TERM, options.terminfoDirs)) {
    supportDetected = true;
    return true;
  }

  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    supportDetected = false;
    return false;
  }

  detectionPromise = new Promise<boolean>((resolve) => {
    const wasRaw = Boolean(stdin.isRaw);
    const wasPaused = stdin.isPaused();
    let buffer = "";
    let settled = false;

    const finish = (supported: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stdin.removeListener("data", onData);

      try {
        stdin.setRawMode(wasRaw);
      } catch {
        // Ignore errors if stdin was closed during probe.
      }
      if (wasPaused) {
        stdin.pause();
      }

      // Strip protocol replies and push back any user typeahead bytes.
      const leftover = buffer.replace(OSC_7501_REPLY_REGEX, "").replace(DA1_REPLY_REGEX, "");
      if (leftover.length > 0) {
        stdin.unshift(Buffer.from(leftover, "utf8"));
      }

      supportDetected = supported;
      detectionPromise = undefined;
      resolve(supported);
    };

    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const da1Match = DA1_REPLY_REGEX.exec(buffer);
      if (da1Match) {
        const oscMatch = OSC_7501_REPLY_REGEX.exec(buffer);
        const supported = Boolean(oscMatch && oscMatch.index < da1Match.index);
        finish(supported);
      }
    };

    const timer = setTimeout(() => {
      const oscMatch = OSC_7501_REPLY_REGEX.exec(buffer);
      finish(Boolean(oscMatch));
    }, timeoutMs);

    try {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
      stderr.write(FEATURE_DETECT_QUERY);
    } catch {
      finish(false);
    }
  });

  return detectionPromise;
}

/**
 * Emits a raw `ProgramStatusReport` to `stderr` if OSC 7501 is supported.
 */
export function emitReport(
  report: ProgramStatusReport,
  stderr: NodeJS.WriteStream = process.stderr,
): void {
  if (!isProgramStatusSupported()) {
    return;
  }
  const seq = formatReportSequence(report);
  if (!seq) {
    return;
  }
  if (report.id !== undefined) {
    if (report.state !== "clear") {
      hasActiveChildRecords = true;
    }
  } else if (report.state === "clear") {
    hasActiveChildRecords = false;
  }
  stderr.write(seq);
}

/**
 * Updates the root record to `state=working` with the given message and optional progress.
 */
export function setWorkingStatus(options: WorkingContext): void {
  if (userInterrupted) {
    return;
  }
  if (workingStack.length === 0) {
    workingStack.push({ ...options });
  } else {
    workingStack[workingStack.length - 1] = { ...options };
  }
  emitReport({
    state: "working",
    msg: options.msg,
    progress: options.progress,
  });
}

/**
 * Pushes a scoped `working` status onto the stack for the duration of `fn()`,
 * restoring the parent `working` status when `fn()` settles.
 */
export async function withWorkingStatus<T>(
  options: WorkingContext | string,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx: WorkingContext = typeof options === "string" ? { msg: options } : options;
  workingStack.push(ctx);
  if (!userInterrupted) {
    emitReport({
      state: "working",
      msg: ctx.msg,
      progress: ctx.progress,
    });
  }
  try {
    return await fn();
  } finally {
    workingStack.pop();
    if (!userInterrupted && workingStack.length > 0) {
      const current = workingStack[workingStack.length - 1];
      emitReport({
        state: "working",
        msg: current.msg,
        progress: current.progress,
      });
    }
  }
}

/**
 * Sets the root record to `state=blocked` with a `kind` and `msg`.
 */
export function setBlockedStatus(options: {
  kind: BlockedKind;
  msg: string;
  progress?: number;
}): void {
  if (userInterrupted) {
    return;
  }
  emitReport({
    state: "blocked",
    kind: options.kind,
    msg: options.msg,
    progress: options.progress,
  });
}

/**
 * Restores the root record to the active `working` state on the stack.
 */
export function restoreWorkingStatus(): void {
  if (userInterrupted || workingStack.length === 0) {
    return;
  }
  const current = workingStack[workingStack.length - 1];
  emitReport({
    state: "working",
    msg: current.msg,
    progress: current.progress,
  });
}

/**
 * Transitions the root record to `state=blocked` while awaiting `fn()`,
 * restoring the previous `working` state when `fn()` settles.
 */
export async function withBlockedStatus<T>(
  kind: BlockedKind,
  msg: string,
  fn: () => Promise<T>,
): Promise<T> {
  setBlockedStatus({ kind, msg });
  try {
    return await fn();
  } finally {
    restoreWorkingStatus();
  }
}

/**
 * Reports status for a child record (`id` path).
 */
export function setChildRecordStatus(options: {
  id: string;
  state: Exclude<ProgramState, "clear">;
  title?: string;
  msg?: string;
  progress?: number;
  kind?: BlockedKind;
}): void {
  if (userInterrupted) {
    return;
  }
  emitReport({
    id: options.id,
    state: options.state,
    title: options.title,
    msg: options.msg,
    progress: options.progress,
    kind: options.kind,
  });
}

/**
 * Clears the specified record `id` (and all descendants) or all terminal records if `id` is omitted.
 */
export function clearRecord(id?: string): void {
  emitReport({
    state: "clear",
    id,
  });
}

/**
 * Clears all child records if any were emitted during the session.
 */
export function clearActiveChildRecords(): void {
  if (!hasActiveChildRecords) {
    return;
  }
  hasActiveChildRecords = false;
  emitReport({ state: "clear" });
}

/**
 * Sets the root record to `state=idle` (e.g. when a local server or REPL is ready and waiting).
 */
export function setIdleStatus(msg?: string): void {
  emitReport({
    state: "idle",
    msg,
  });
}

/**
 * Marks the current execution as interrupted/cancelled by the user and reports `state=idle`.
 */
export function markUserInterrupted(msg?: string): void {
  userInterrupted = true;
  clearActiveChildRecords();
  emitReport({
    state: "idle",
    msg,
  });
}

/**
 * Returns whether the user has interrupted or cancelled the current execution.
 */
export function isUserInterrupted(): boolean {
  return userInterrupted;
}

/**
 * Reports `state=done` on the root record (or `state=idle` if interrupted by the user).
 */
export function setDoneStatus(msg?: string): void {
  clearActiveChildRecords();
  if (userInterrupted) {
    emitReport({ state: "idle" });
    return;
  }
  workingStack = [];
  emitReport({
    state: "done",
    msg,
  });
}

/**
 * Reports `state=error` on the root record (or `state=idle` if interrupted by the user).
 */
export function setErrorStatus(msg?: string): void {
  clearActiveChildRecords();
  if (userInterrupted) {
    emitReport({ state: "idle" });
    return;
  }
  workingStack = [];
  emitReport({
    state: "error",
    msg,
  });
}

/**
 * Checks whether an error represents a user prompt cancellation (e.g., Ctrl+C in Inquirer)
 * or an explicit user decline of a confirmation prompt.
 */
export function isUserCancellationError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const errorObj = err as { name?: unknown; message?: unknown };
  if (errorObj.name === "ExitPromptError") {
    return true;
  }
  if (typeof errorObj.message === "string") {
    if (errorObj.message.includes("User force closed the prompt")) {
      return true;
    }
    const cleanMsg = sanitizeFreeText(errorObj.message, 256);
    if (USER_CANCEL_MESSAGES.includes(cleanMsg)) {
      return true;
    }
  }
  return false;
}
