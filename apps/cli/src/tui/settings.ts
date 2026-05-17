import type { SettingsTab } from "./components/SettingsView";

// Static settings catalog. Real persistence comes later — for now this drives
// the visual settings screen and reads sensible defaults / current config
// values where available.
export function buildSettingsTabs(opts: {
  server?: string;
  userName?: string;
  pollIntervalMs: number;
}): SettingsTab[] {
  return [
    {
      key: "general",
      label: "General",
      items: [
        {
          key: "default-filter",
          label: "Default Filter",
          value: "All",
          description: "Filter applied when the app starts. One of: Inbox, All, Done.",
        },
        {
          key: "confirm-delete",
          label: "Confirm Delete",
          value: "true",
          description: "Prompt before permanently deleting a todo with `d`.",
        },
        {
          key: "sort-order",
          label: "Sort Order",
          value: "updated_desc",
          description: "Order todos by updated_desc, created_desc, or title_asc.",
        },
      ],
    },
    {
      key: "network",
      label: "Network",
      items: [
        {
          key: "server-url",
          label: "Server URL",
          value: opts.server ?? "—",
          description: "Base URL of the dox server this client talks to.",
        },
        {
          key: "poll-interval",
          label: "Poll Interval",
          value: `${opts.pollIntervalMs} ms`,
          description: "Background refresh cadence. Lower = fresher, higher = less load.",
        },
        {
          key: "request-timeout",
          label: "Request Timeout",
          value: "10000 ms",
          description: "Maximum time a single request waits before failing.",
        },
        {
          key: "user-name",
          label: "Logged-in User",
          value: opts.userName ?? "—",
          description: "Identity bound to the current device token (read-only).",
        },
      ],
    },
    {
      key: "display",
      label: "Display",
      items: [
        {
          key: "compact-rows",
          label: "Compact Rows",
          value: "false",
          description: "Reduce vertical spacing in the todo list.",
        },
        {
          key: "show-details",
          label: "Show Details Panel",
          value: "true",
          description: "Display the Todo Details inspector on the right column.",
        },
        {
          key: "show-chunk-map",
          label: "Show Chunk Map",
          value: "true",
          description: "Display the per-todo status grid below the details panel.",
        },
        {
          key: "theme",
          label: "Theme",
          value: "neon",
          description: "Active color palette. Currently only `neon` is bundled.",
        },
      ],
    },
    {
      key: "projects",
      label: "Projects",
      items: [
        {
          key: "hide-archived",
          label: "Hide Archived",
          value: "true",
          description: "Omit archived projects from filter tabs and the sidebar.",
        },
        {
          key: "default-color",
          label: "Default Color",
          value: "magenta",
          description: "Color applied to new projects when none is specified.",
        },
      ],
    },
    {
      key: "advanced",
      label: "Advanced",
      items: [
        {
          key: "debug",
          label: "Debug Mode",
          value: "false",
          description: "Print verbose request/response logs to the console.",
        },
        {
          key: "log-path",
          label: "Log File",
          value: "~/.local/state/dox/dox.log",
          description: "Where verbose logs are written when debug mode is on.",
        },
      ],
    },
  ];
}
