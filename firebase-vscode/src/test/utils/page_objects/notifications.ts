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
        "Trying to execute an operation on the emulator, but it isn't started yet. " +
          "Do you want to start it?"
      );
    });
  }

  async startEmulatorFromNotification(notification: Notification) {
    // wdio doesn't properly find actions: await askToStartEmulatorNotif?.takeAction("Yes");
    const installButton = await notification?.elem.$("a.monaco-button=Yes");
    if (installButton) {
      await installButton.click();
    }
  }
}
