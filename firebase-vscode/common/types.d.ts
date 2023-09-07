export interface ServiceAccount {
  user: ServiceAccountUser
}

export interface ServiceAccountUser {
  email: string;
  type: 'service_account'
}

export interface FeaturesEnabled {
  hosting?: boolean,
  emulators?: boolean,
  frameworks?: boolean,
  quickstart?: boolean
}

/**
 * VSCode Extension settings
 */
export interface Settings {
  shouldWriteDebug: boolean,
  debugLogPath: string,
  featuresEnabled: FeaturesEnabled,
  npmPath: string
}
