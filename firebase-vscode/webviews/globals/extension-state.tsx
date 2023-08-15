import React, { createContext, ReactNode, useContext, useEffect } from "react";
import { broker } from "./html-broker";
import { signal, computed } from "@preact/signals-react";
import { User } from "../types/auth";

export enum Environment {
  UNESPECIFIED,
  VSC,
  IDX,
}

function createExtensionState() {
  const environment = signal(Environment.UNESPECIFIED);
  const users = signal<User[]>([]);
  const selectedUserEmail = signal("");
  const projectId = signal("");

  const selectedUser = computed(() =>
    users.value.find((user) => user.email === selectedUserEmail.value)
  );

  return { environment, users, projectId, selectedUserEmail, selectedUser };
}

const ExtensionState =
  createContext<ReturnType<typeof createExtensionState>>(null);

export function ExtensionStateProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const state = createExtensionState();

  useEffect(() => {
    broker.on("notifyEnv", ({ env }) => {
      state.environment.value = env.isMonospace
        ? Environment.IDX
        : Environment.VSC;
    });

    broker.on("notifyUsers", ({ users }) => {
      state.users.value = users;
    });

    broker.on("notifyUserChanged", ({ user }) => {
      state.selectedUserEmail.value = user.email;
    });

    broker.on("notifyProjectChanged", ({ projectId }) => {
      state.projectId.value = projectId;
    });

    broker.send("getInitialData");
  }, [state]);

  return (
    <ExtensionState.Provider value={state}>{children}</ExtensionState.Provider>
  );
}

export function useExtensionState() {
  return useContext(ExtensionState);
}
