"use client";

import React from "react";
import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

/** Show a concise action confirmation with a single-use Undo control. */
export function showUndoableAction({
  title,
  message,
  onUndo,
}: {
  title: string;
  message: string;
  onUndo: () => void | Promise<void>;
}): string {
  let notificationId = "";
  let used = false;

  const undoOnce = () => {
    if (used) return;
    used = true;
    if (notificationId) notifications.hide(notificationId);
    void onUndo();
  };

  notificationId = notifications.show({
    title,
    color: "teal",
    autoClose: 6000,
    message: (
      <Group gap="sm" justify="space-between" wrap="nowrap">
        <Text size="sm">{message}</Text>
        <Button
          type="button"
          variant="subtle"
          color="dark"
          size="compact-xs"
          onClick={undoOnce}
          aria-label={`Undo ${title.toLowerCase()}`}
        >
          Undo
        </Button>
      </Group>
    ),
  });

  return notificationId;
}
