import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import React, { HTMLAttributes, PropsWithChildren } from "react";
import { Icon, IconName } from "./Icon";

type TextProps<T> = PropsWithChildren<
  T &
    HTMLAttributes<HTMLElement> & {
      icon: IconName;
      tooltip: string;
    }
>;

export const IconButton: React.FC<TextProps<{}>> = ({
  icon,
  tooltip,
  className,
  ...props
}) => {
  return (
    <VSCodeButton
      appearance="icon"
      className={className}
      ariaLabel={tooltip}
      title={tooltip}
      {...(props as any)}
    >
      <Icon icon={icon} />
    </VSCodeButton>
  );
};
