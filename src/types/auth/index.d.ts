// The wire protocol for an access token returned by Google.
// When we actually refresh from the server we should always have
// these optional fields, but when a user passes --token we may
// only have access_token.
export interface Tokens {
  id_token?: string;
  access_token: string;
  refresh_token?: string;
  scopes?: string[];
}

export interface User {
  email: string;

  iss?: string;
  azp?: string;
  aud?: string;
  sub?: number;
  hd?: string;
  email_verified?: boolean;
  at_hash?: string;
  iat?: number;
  exp?: number;
}

export interface Account {
  user: User;
  tokens: TokensWithExpiration;
}
export interface TokensWithExpiration extends Tokens {
  expires_at?: number;
}
export interface TokensWithTTL extends Tokens {
  expires_in?: number;
}

export interface AuthError {
  error?: string;
  error_description?: string;
  error_uri?: string;
  error_subtype?: string;
}

export interface UserCredentials {
  user: string | User;
  tokens: TokensWithExpiration;
  scopes: string[];
}
// https://docs.github.com/en/developers/apps/authorizing-oauth-apps
export interface GitHubAuthResponse {
  access_token: string;
  scope: string;
  token_type: string;
}
