import * as uuid from "uuid";
import { EmulatorLogger } from "../emulatorLogger";
import { EmulatorInfo, Emulators } from "../types";
import { Client } from "../../apiv2";
import { EmulatorRegistry } from "../registry";
import { toSerializedDate } from "../storage/metadata";
import { CloudEvent } from "../events/types";
import { RemoteConfigEventData } from "@google/events/firebase/remoteconfig/v1/RemoteConfigEventData";

type RemoteConfigFunctionAction = "update";
const REMOTE_CONFIG_V2_ACTION_MAP: Record<RemoteConfigFunctionAction, string> = {
  update: "update",
};

export interface RemoteConfigEventPayload {
  description: string;
  updateOrigin: string;
  updateTime: string;
  updateType: string;
  updateUser: any;
  versionNumber: number;
}

export class RemoteConfigCloudFunctions {
  private logger = EmulatorLogger.forEmulator(Emulators.REMOTE_CONFIG);
  private functionsEmulatorInfo?: EmulatorInfo;
  private multicastOrigin = "";
  private multicastPath = "";
  private enabled = false;
  private client?: Client;

  constructor(private projectId: string) {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);

    if (functionsEmulator) {
      this.enabled = true;
      this.functionsEmulatorInfo = functionsEmulator.getInfo();
      this.multicastOrigin = `http://${EmulatorRegistry.getInfoHostString(
        this.functionsEmulatorInfo
      )}`;
      this.multicastPath = `/functions/projects/${projectId}/trigger_multicast`;
      this.client = new Client({ urlPrefix: this.multicastOrigin, auth: false });
    }
  }

  public async dispatch(
    action: RemoteConfigFunctionAction,
    object: RemoteConfigEventPayload
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const errStatus: Array<number> = [];
    let err: Error | undefined;
    try {
      /** Legacy Google Events */
      const eventBody = this.createLegacyEventRequestBody(action, object);
      const eventRes = await this.client!.post(this.multicastPath, eventBody);
      if (eventRes.status !== 200) {
        console.log("iaw: pushing events");
        errStatus.push(eventRes.status);
      }
      /** Modern CloudEvents */
      // const cloudEventBody = this.createCloudEventRequestBody(action, object);
      // const cloudEventRes = await this.client!.post<CloudEvent<RemoteConfigEventData>, any>(
      //   this.multicastPath,
      //   cloudEventBody,
      //   {
      //     headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" },
      //   }
      // );
      // if (cloudEventRes.status !== 200) {
      //   console.log("iaw: pushing cloud events");
      //   errStatus.push(cloudEventRes.status);
      // }
    } catch (e: any) {
      err = e as Error;
    }

    if (err || errStatus.length > 0) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        "Firebase Remote Config function was not triggered due to emulation error. Please file a bug."
      );
    }
  }

  private createLegacyEventRequestBody(
    action: RemoteConfigFunctionAction,
    templateVersion: RemoteConfigEventPayload
  ) {
    const timestamp = new Date();
    return {
      eventId: `${timestamp.getTime()}`,
      timestamp: toSerializedDate(timestamp),
      eventType: `google.firebase.remoteconfig.${action}`,
      resource: {
        service: "firebseremoteconfig.googleapis.com",
        name: `projects/_/remoteConfig`,
        type: "remoteconfig",
      },
      data: templateVersion,
    };
  }

  // private createCloudEventRequestBody(
  //   action: RemoteConfigFunctionAction,
  //   templateVersion: RemoteConfigEventPayload
  // ): CloudEvent<RemoteConfigEventData> {
  //   const timestamp = new Date();
  //   const data = templateVersion as unknown as RemoteConfigEventData;
  //   const time = new Date().toISOString();
  //   return {
  //     specversion: "1",
  //     id: uuid.v4(),
  //     type: `google.firebase.remoteconfig.v1.${action}`,
  //     source: `//firebaseremoteconfig.googleapis.com/projects/_/remoteConfig`,
  //     time,
  //     data,
  //   };
  // }
}
