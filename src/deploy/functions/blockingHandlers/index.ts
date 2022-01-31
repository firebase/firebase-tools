import * as backend from "../backend";


export interface BlockingHandler {
  readonly name: string;
  readonly eventName: string;
  readonly enabledApis: string[];
  ensureFunctionCount: (endpoints: backend.Endpoint[]) => boolean;
  updateServiceConfig: (eventName: string, fnUri: string, fnOpts: any) => Promise<any>;
}

export const NoopHandler: BlockingHandler = {
  name: 'noop',
  eventName: '',
  enabledApis: [],
}

export const BeforeCreateHandler: BlockingHandler = {
  name: 'beforeCreate',
  eventName: 'providers/cloud.auth/eventTypes/user.beforeCreate',
  enabledApis: [''],
};

export const BeforeSignInHandler: BlockingHandler = {
  name: 'beforeCreate',
  eventName: 'providers/cloud.auth/eventTypes/user.beforeSignIn',
  enabledApis: [''],
};

export const EVENT_HANDLER_MAPPING: Record<string, string> = {

}

