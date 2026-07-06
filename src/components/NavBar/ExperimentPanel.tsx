"use client";

import { Popover, ActionIcon, Switch, Text, Button, Tooltip, Divider } from "@mantine/core";
import { IconFlask } from "@tabler/icons-react";
import {
  useExperimentFlags,
  setExperimentFlag,
  resetExperimentFlags,
  FLAG_META,
} from "../../utils/experimentFlags";

/**
 * Experiment settings popover (TopNav flask button). Each switch toggles one
 * thread-display condition; OFF = the control/legacy behavior for that feature.
 */
export function ExperimentPanel() {
  const flags = useExperimentFlags();

  return (
    <Popover width={340} position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label="Experiment settings" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Experiment settings"
            data-testid="nav-experiments"
          >
            <IconFlask size={20} stroke={1.8} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown style={{ maxHeight: 420, overflowY: "auto" }}>
        <Text size="sm" fw={700} mb={2}>
          Experiment settings
        </Text>
        <Text size="xs" c="dimmed" mb="sm">
          Thread-display conditions. Off = the traditional interface for that feature.
        </Text>
        {FLAG_META.map(({ key, label, description }) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <Switch
              size="sm"
              checked={flags[key]}
              onChange={(e) => setExperimentFlag(key, e.currentTarget.checked)}
              label={label}
              data-testid={`flag-${key}`}
              styles={{ label: { fontWeight: 600, fontSize: 13 } }}
            />
            <Text size="xs" c="dimmed" style={{ marginLeft: 42, marginTop: 2 }}>
              {description}
            </Text>
          </div>
        ))}
        <Divider my="xs" />
        <Button
          variant="subtle"
          size="compact-xs"
          color="gray"
          onClick={resetExperimentFlags}
          data-testid="flags-reset"
        >
          Reset to defaults
        </Button>
      </Popover.Dropdown>
    </Popover>
  );
}
