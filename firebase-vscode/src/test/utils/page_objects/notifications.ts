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

  async startEmulatorFromNotification(notification: Notification) {
    // wdio doesn't properly find actions: await askToStartEmulatorNotif?.takeAction("Yes");
    const installButton = await notification?.elem.$("a.monaco-button=Yes");
    if (installButton) {
      await installButton.click();
    }
  }
}
