export interface ServiceAccount {
  user: ServiceAccountUser;
}

export interface ServiceAccountUser {
  email: string;
  type: "service_account";
}
