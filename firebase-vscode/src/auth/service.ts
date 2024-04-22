import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { UserMock } from "../../common/messaging/protocol";

export class AuthService implements Disposable {
  constructor(readonly broker: ExtensionBrokerImpl) {
    this.disposable.push({
      dispose: broker.on(
        "notifyAuthUserMockChange",
        (userMock) => (this.userMock = userMock)
      ),
    });
  }

  userMock: UserMock | undefined;
  disposable: Disposable[] = [];

  dispose() {
    for (const disposable of this.disposable) {
      disposable.dispose();
    }
  }
}
