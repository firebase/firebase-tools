import { getAllAccounts, loginAdditionalAccount } from '../../src/auth';
import { logout } from '../../src/commands/logout';
import { listFirebaseProjects } from '../../src/management/projects';

export function getUsers() {
  return getAllAccounts();
}

export async function logoutUser(email: string): Promise<boolean> {
  return logout(email, {});
}

export async function login() {
  return loginAdditionalAccount(true);
}

export async function listProjects() {
  return listFirebaseProjects();
}