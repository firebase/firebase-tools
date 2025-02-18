import { Workbench, Notification } from "wdio-vscode-service";

export class Notifications {
  constructor(readonly workbench: Workbench) {}

  async getExportNotification() {
    const notifications = await this.workbench.getNotifications();
    return notifications.find(async (n) => {
      const message = await n.getMessage();
      return message.includes("Emulator Data exported to");
    });
  }

  async getStartEmulatorNotification() {
    const notifications = await this.workbench.getNotifications();
    return notifications.find(async (notif) => {
      return (
        (await notif.getMessage()) ===
        "Automatically starting emulator... Please retry `Run local` execution after it's started."
      );
    });
  }

  // Edit Variables Notification
  async getEditVariablesNotification() {
    await browser.pause(250);
    const notifications = await this.workbench.getNotifications();
    return notifications.find(async (n) => {
      const message = await n.getMessage();
      return message.includes("Missing required variables");
    });
  }

  async editVariablesFromNotification(notification: Notification) {
    // takeAction doesn't work in wdio vscode
    const editButton = await notification.elem.$(".monaco-button=Edit variables");
    if (editButton) {
      await editButton.click();
    }
  }
}
