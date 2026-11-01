import type { SVGProps } from "react";

type Props = { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const IconInbox = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 12h5l2 3h4l2-3h5" />
    <path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
  </svg>
);

export const IconToday = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconUpcoming = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8.5 3.5V6M15.5 3.5V6" />
  </svg>
);

export const IconActivity = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 12h4l2.5-6 4 12L16 12h5" />
  </svg>
);

export const IconSearch = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const IconPlus = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSettings = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M4.5 7.5l1.9 1.1M17.6 15.4l1.9 1.1M19.5 7.5l-1.9 1.1M6.4 15.4l-1.9 1.1" />
  </svg>
);

export const IconTrash = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 12.5h10L18 7" />
  </svg>
);

export const IconClose = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconCheck = ({ size = 16 }: Props) => (
  <svg {...base(size)} strokeWidth={2.2}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const IconRefresh = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M20 11a8 8 0 1 0-2.3 6" />
    <path d="M20 5v6h-6" />
  </svg>
);

export const IconChevron = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconGrid = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.6" />
    <rect x="14" y="14" width="6.5" height="6.5" rx="1.6" />
  </svg>
);

export const IconNote = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M5.5 3.5h9L19 8v12.5H5.5Z" />
    <path d="M14 3.5V8h5M8.5 12.5h7M8.5 16.5h4.5" />
  </svg>
);

export const IconTag = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M11.5 3.5H20v8.5l-8 8-8.5-8.5Z" />
    <circle cx="16" cy="8" r="1.3" />
  </svg>
);

export const IconCalendar = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10.5h17M8 3.5V7M16 3.5V7" />
  </svg>
);

export const IconClock = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconSquare = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" />
  </svg>
);

export const IconEdit = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M4 20h4l10.5-10.5a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6Z" />
    <path d="M13.5 7.5 16.5 10.5" />
  </svg>
);

export const IconSliders = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M4 7.5h5M13 7.5h7M4 16.5h8M16 16.5h4" />
    <circle cx="11" cy="7.5" r="2.2" />
    <circle cx="14" cy="16.5" r="2.2" />
  </svg>
);

export const IconChevronDown = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);
