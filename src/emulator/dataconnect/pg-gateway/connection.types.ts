export type ClientParameters = {
  user: string;
  [key: string]: string;
};

export type ClientInfo = {
  majorVersion: number;
  minorVersion: number;
  parameters: ClientParameters;
};

export type TlsInfo = {
  sniServerName?: string;
};

export const ServerStep = {
  AwaitingInitialMessage: 'AwaitingInitialMessage',
  PerformingAuthentication: 'PerformingAuthentication',
  ReadyForQuery: 'ReadyForQuery',
} as const;

export type ServerStep = (typeof ServerStep)[keyof typeof ServerStep];

export type ConnectionState = {
  hasStarted: boolean;
  isAuthenticated: boolean;
  clientInfo?: ClientInfo;
  tlsInfo?: TlsInfo;
  step: ServerStep;
};
