import * as devconnect from "../../gcp/devConnect";

export const projectId = "projectId";
export const location = "us-central1";

export function mockConn(id: string): devconnect.Connection {
  return {
    name: `projects/${projectId}/locations/${location}/connections/${id}`,
    disabled: false,
    createTime: "0",
    updateTime: "1",
    installationState: {
      stage: "COMPLETE",
      message: "complete",
      actionUri: "https://google.com",
    },
    reconciling: false,
  };
}

export function mockRepo(name: string): devconnect.GitRepositoryLink {
  return {
    name: `${name}`,
    cloneUri: `https://github.com/test/${name}.git`,
    createTime: "",
    updateTime: "",
    deleteTime: "",
    reconciling: false,
    uid: "",
  };
}

export function completedOperation(connectionId: string) {
  return {
    name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
    done: true,
  };
}

export function pendingConnection(connectionId: string) {
  return {
    name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
    disabled: false,
    createTime: "0",
    updateTime: "1",
    installationState: {
      stage: "PENDING_USER_OAUTH",
      message: "pending",
      actionUri: "https://google.com",
    },
    reconciling: false,
  };
}

export function completeConnection(connectionId: string) {
  return {
    name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
    disabled: false,
    createTime: "0",
    updateTime: "1",
    installationState: {
      stage: "COMPLETE",
      message: "complete",
      actionUri: "https://google.com",
    },
    githubConfig: {
      githubApp: "FIREBASE",
      authorizerCredential: {
        oauthTokenSecretVersion: "1",
        username: "testUser",
      },
      appInstallationId: "installationID",
      installationUri: "http://uri",
    },
    reconciling: false,
  };
}

export const mockRepos = {
  repositories: [
    {
      name: "repo0",
      remoteUri: "https://github.com/test/repo0.git",
    },
    {
      name: "repo1",
      remoteUri: "https://github.com/test/repo1.git",
    },
  ],
};
