import { Workbench } from "wdio-vscode-service";

export class Notifications {
  constructor(readonly workbench: Workbench) {}

  async getExportNotification() {
    const notifications = await this.workbench.getNotifications();
    return notifications.find(async n => { 
      const message = await n.getMessage();
      return message.includes("Emulator Data exported to");
    });
  }
}