import React from "react";

/* ---------------- tool glyphs ---------------- */

export function Glyph({ name, size = 21 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const paths = {
    select: <path d="M6 3 L6 18 L9.6 14.2 L12.6 20 L15 18.9 L12 13.4 L18 12.6 Z" />,
    wall: (
      <React.Fragment>
        <path d="M2 9h20" />
        <path d="M2 15h20" />
        <path d="M2 9v6" />
        <path d="M22 9v6" />
      </React.Fragment>
    ),
    room: <path d="M4 6.5 L12 3 L20.5 8 L17.5 20.5 L6 18.5 Z" />,
    door: (
      <React.Fragment>
        <path d="M3 20h4" />
        <path d="M7 20V7" />
        <path d="M7 7a13 13 0 0 1 13 13" />
        <path d="M20 20h1" />
      </React.Fragment>
    ),
    furn: (
      <React.Fragment>
        <rect x="3" y="9" width="18" height="9" rx="1" />
        <path d="M6.5 9V5.5h11V9" />
      </React.Fragment>
    ),
    tape: (
      <React.Fragment>
        <rect x="2.5" y="8" width="19" height="8" rx="1" />
        <path d="M7 8v3.5" />
        <path d="M11 8v5" />
        <path d="M15 8v3.5" />
        <path d="M19 8v5" />
      </React.Fragment>
    ),
    image: (
      <React.Fragment>
        <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
        <path d="M2.5 16l5-5 4.5 4.5L15 12.5l6.5 6" />
        <circle cx="8.5" cy="9" r="1.4" />
      </React.Fragment>
    ),
    section: (
      <React.Fragment>
        <path d="M2 19h20" />
        <path d="M3 19V11l9-7 9 7v8" />
        <path d="M8 19v-5h4v5" />
      </React.Fragment>
    ),
    export: (
      <React.Fragment>
        <path d="M12 3v11" />
        <path d="M8 7.5 12 3l4 4.5" />
        <path d="M3.5 15v4.5h17V15" />
      </React.Fragment>
    ),
    more: (
      <React.Fragment>
        <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </React.Fragment>
    ),
    sun: (
      <React.Fragment>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </React.Fragment>
    ),
    camera: (
      <React.Fragment>
        <path d="M3 8.5h4l1.6-2.5h6.8L17 8.5h4V19H3Z" />
        <circle cx="12" cy="13.3" r="3.5" />
      </React.Fragment>
    ),
    cube: (
      <React.Fragment>
        <path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4Z" />
        <path d="M3 7.4 12 12l9-4.6" />
        <path d="M12 12v9.4" />
      </React.Fragment>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}
