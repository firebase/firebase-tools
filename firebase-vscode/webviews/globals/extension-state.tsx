import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { broker } from "./html-broker";
import { signal, computed } from "@preact/signals-react";
import { User } from "../types/auth";

export enum Environment {
  UNSPECIFIED,
  VSC,
  IDX,
}

function createExtensionState() {
  const environment = signal(Environment.UNSPECIFIED);
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

/** Global extension state, this should live high in the react-tree to minimize superfluous renders */
export function ExtensionStateProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const state = useMemo(() => createExtensionState(), []);

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
