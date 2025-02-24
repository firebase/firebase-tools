/**
 * Frontend message codes
 * @see https://www.postgresql.org/docs/current/protocol-message-codes.html
 */
export const FrontendMessageCode = {
  Query: 0x51, // Q
  Parse: 0x50, // P
  Bind: 0x42, // B
  Execute: 0x45, // E
  FunctionCall: 0x46, // F
  Flush: 0x48, // H
  Close: 0x43, // C
  Describe: 0x44, // D
  CopyFromChunk: 0x64, // d
  CopyDone: 0x63, // c
  CopyData: 0x64, // d
  CopyFail: 0x66, // f
  Password: 0x70, // p
  Sync: 0x53, // S
  Terminate: 0x58, // X
} as const;

/**
 * Backend message codes
 * @see https://www.postgresql.org/docs/current/protocol-message-codes.html
 */
export const BackendMessageCode = {
  DataRow: 0x44, // D
  ParseComplete: 0x31, // 1
  BindComplete: 0x32, // 2
  CloseComplete: 0x33, // 3
  CommandComplete: 0x43, // C
  ReadyForQuery: 0x5a, // Z
  NoData: 0x6e, // n
  NotificationResponse: 0x41, // A
  AuthenticationResponse: 0x52, // R
  ParameterStatus: 0x53, // S
  BackendKeyData: 0x4b, // K
  ErrorMessage: 0x45, // E
  NoticeMessage: 0x4e, // N
  RowDescriptionMessage: 0x54, // T
  ParameterDescriptionMessage: 0x74, // t
  PortalSuspended: 0x73, // s
  ReplicationStart: 0x57, // W
  EmptyQuery: 0x49, // I
  CopyIn: 0x47, // G
  CopyOut: 0x48, // H
  CopyDone: 0x63, // c
  CopyData: 0x64, // d
} as const;

export function getFrontendMessageName(code: number) {
  return Object.entries(FrontendMessageCode).find(([_, value]) => value === code)?.[0];
}

export function getBackendMessageName(code: number) {
  return Object.entries(BackendMessageCode).find(([_, value]) => value === code)?.[0];
}
