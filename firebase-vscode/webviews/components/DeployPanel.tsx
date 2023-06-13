import {
  VSCodeButton,
  VSCodeDivider,
  VSCodeProgressRing,
  VSCodeRadio,
  VSCodeRadioGroup,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import cn from "classnames";
import React, { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";
import { Spacer } from "./ui/Spacer";
import { Label } from "./ui/Text";
import { broker } from "../globals/html-broker";
import styles from "../sidebar.entry.scss";
import { PanelSection } from "./ui/PanelSection";
import { HostingState } from "../webview-types";
import { ChannelWithId } from "../messaging/types";
import { ExternalLink } from "./ui/ExternalLink";

interface DeployInfo {
  date: string;
  channelId: string;
}

export function DeployPanel({
  hostingState,
  setHostingState,
  projectId,
  channels,
}: {
  hostingState: HostingState;
  setHostingState: (hostingState: HostingState) => void;
  projectId: string;
  channels: ChannelWithId[];
}) {
  const [deployTarget, setDeployTarget] = useState<string>("live");
  const [newPreviewChannel, setNewPreviewChannel] = useState<string>("");
  const [deployedInfo, setDeployedInfo] = useState<DeployInfo>(null);

  useEffect(() => {
    if (hostingState === "deployed") {
      setDeployedInfo({
        date: new Date().toLocaleDateString(),
        channelId: deployTarget === "new" ? newPreviewChannel : deployTarget,
      });
      setNewPreviewChannel("");
    }
  }, [hostingState]);

  if (!channels || channels.length === 0) {
    return (
      <>
        <VSCodeDivider style={{ width: "100vw" }} />
        <Spacer size="medium" />
        <PanelSection title="Hosting">
          <Label>Loading hosting channels</Label>
          <Label>
            <VSCodeProgressRing />
          </Label>
        </PanelSection>
      </>
    );
  }

  channels.sort((a, b) => (a.id === "live" ? -1 : 0));

  const channelOptions = channels.map((channel) => (
    <VSCodeRadio
      name="deployTarget"
      value={channel.id}
      key={channel.id + (channel.id === deployTarget ? "-checked" : "")}
      checked={channel.id === deployTarget}
      onChange={(e) => setDeployTarget(e.target.value)}
    >
      {channel.id}
    </VSCodeRadio>
  ));
  let siteLink = null;

  const existingChannel = channels.find(
    (channel) => channel.id === deployTarget
  );

  if (existingChannel) {
    siteLink = (
      <ExternalLink
        href={existingChannel.url}
        text={
          existingChannel.id === "live"
            ? `${projectId}.web.app`
            : `go to ${existingChannel.id} site`
        }
      />
    );
  }

  return (
    <>
      <VSCodeDivider style={{ width: "100vw" }} />
      <Spacer size="medium" />
      <PanelSection title="Hosting">
        <>
          <VSCodeButton
            disabled={hostingState === "deploying"}
            onClick={() => {
              setHostingState("deploying");
              broker.send("hostingDeploy", {
                target:
                  deployTarget === "new" ? newPreviewChannel : deployTarget,
              });
            }}
          >
            Deploy to channel:{" "}
            {deployTarget === "new" ? newPreviewChannel : deployTarget}
          </VSCodeButton>
          <VSCodeRadioGroup
            name="deployTarget"
            onChange={(e) => setDeployTarget(e.target.value)}
            orientation="vertical"
          >
            {channelOptions}
            <VSCodeRadio
              name="deployTarget"
              value="new"
              checked={"new" === deployTarget}
            >
              new (type new id below)
            </VSCodeRadio>
          </VSCodeRadioGroup>
          <VSCodeTextField
            onInput={(e) => {
              setNewPreviewChannel(e.target.value);
            }}
            value={newPreviewChannel}
            placeholder="new preview channel id"
          ></VSCodeTextField>
          <Spacer size="xsmall" />
          {hostingState !== "deploying" && (
            <>
              <Spacer size="xsmall" />
              <div>
                <Label level={3} className={styles.hostingRowLabel}>
                  <Spacer size="xsmall" />
                  <Icon
                    className={styles.hostingRowIcon}
                    slot="start"
                    icon="history"
                  ></Icon>
                  {deployedInfo
                    ? `Deployed ${deployedInfo.date} to ${deployedInfo.channelId}`
                    : "Not deployed yet"}
                </Label>
              </div>
            </>
          )}
          {hostingState === "deploying" && (
            <>
              <Spacer size="medium" />
              <div className={styles.integrationStatus}>
                <VSCodeProgressRing
                  className={cn(
                    styles.integrationStatusIcon,
                    styles.integrationStatusLoading
                  )}
                />
                <Label level={3}> Deploying...</Label>
              </div>
            </>
          )}
          <Spacer size="medium" />
          {siteLink && (<Label level={3} className={styles.hostingRowLabel}>
            <Spacer size="xsmall" />
            <Icon
              className={styles.hostingRowIcon}
              slot="start"
              icon="globe"
            ></Icon>
            {siteLink}
          </Label>)}
        </>
      </PanelSection>
    </>
  );
}
