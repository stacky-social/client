"use client";

import { Popover, ActionIcon, Switch, Text, Button, Tooltip, Divider } from "@mantine/core";
import { IconFlask } from "@tabler/icons-react";
import {
  useExperimentFlags,
  useChosenExperimentFlags,
  setExperimentFlag,
  resetExperimentFlags,
  FLAG_META,
} from "../../utils/experimentFlags";

/**
 * Experiment settings popover (TopNav flask button). Each switch toggles one
 * thread-display condition; OFF = the control/legacy behavior for that feature.
 * Switches show the CHOSEN positions; a flag whose dependencies are off is
 * flagged as inactive (the lattice forces it off in the effective condition).
 */
export function ExperimentPanel() {
  const flags = useChosenExperimentFlags();
  const effective = useExperimentFlags();
  const labelFor = (key: string) => FLAG_META.find((m) => m.key === key)?.label ?? key;

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
        {FLAG_META.map(({ key, label, description, dependsOn }) => {
          const unmetDeps = (dependsOn ?? []).filter((dep) => !effective[dep]);
          const inactive = flags[key] && !effective[key];
          return (
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
              {unmetDeps.length > 0 && (
                <Text
                  size="xs"
                  c="orange.7"
                  fw={600}
                  style={{ marginLeft: 42, marginTop: 2 }}
                  data-testid={`flag-${key}-inactive`}
                >
                  {inactive ? "Inactive — requires " : "Requires "}
                  {unmetDeps.map(labelFor).join(" and ")}
                </Text>
              )}
            </div>
          );
        })}
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
