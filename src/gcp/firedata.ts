import { Client } from "../apiv2";
import { firedataOrigin } from "../api";
import { FirebaseError } from "../error";

const client = new Client({ urlPrefix: firedataOrigin(), auth: true, apiVersion: "v1" });

export const APPHOSTING_TOS_ID = "APP_HOSTING_TOS";
export const APP_CHECK_TOS_ID = "APP_CHECK";
export const DATA_CONNECT_TOS_ID = "FIREBASE_DATA_CONNECT";

export type TosId = typeof APPHOSTING_TOS_ID | typeof APP_CHECK_TOS_ID | typeof DATA_CONNECT_TOS_ID;

export type AcceptanceStatus = null | "ACCEPTED" | "TERMS_UPDATED";

export interface TosAcceptanceStatus {
  status: AcceptanceStatus;
}

export interface ServiceTosStatus {
  tosId: TosId;
  serviceStatus: TosAcceptanceStatus;
}

export interface GetTosStatusResponse {
  perServiceStatus: ServiceTosStatus[];
}

/**
 * Fetches the Terms of Service status for the logged in user.
 */
export async function getTosStatus(): Promise<GetTosStatusResponse> {
  const res = await client.get<GetTosStatusResponse>("accessmanagement/tos:getStatus");
  return res.body;
}

/** Returns the AcceptanceStatus for a given product. */
export function getAcceptanceStatus(
  response: GetTosStatusResponse,
  tosId: TosId,
): AcceptanceStatus {
  const perServiceStatus = response.perServiceStatus.find((tosStatus) => tosStatus.tosId === tosId);
  if (perServiceStatus === undefined) {
    throw new FirebaseError(`Missing terms of service status for product: ${tosId}`);
  }
  return perServiceStatus.serviceStatus.status;
}

/** Returns true if a product's ToS has been accepted. */
export function isProductTosAccepted(response: GetTosStatusResponse, tosId: TosId): boolean {
  return getAcceptanceStatus(response, tosId) === "ACCEPTED";
}
