const paths = {
  atlas: (
    <>
      <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" />
      <path d="M9 3v16M15 5v16" />
    </>
  ),
  temple: (
    <>
      <path d="m3 8 9-5 9 5ZM3 21h18M5 18h14M6 9v8m6-8v8m6-8v8" />
    </>
  ),
  scroll: (
    <>
      <path d="M6 4h12a3 3 0 0 1 3 3v2h-5V7a3 3 0 0 0-6 0v11a3 3 0 0 1-6 0v-2h6M7 21h10a3 3 0 0 0 3-3V9M13 12h4m-4 3h4" />
    </>
  ),
  route: (
    <>
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h4" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  leaf: (
    <>
      <path d="M19 3C7 3 3 9 6 15s14 4 13-12ZM5 21l10-13" />
    </>
  ),
  crown: (
    <>
      <path d="m3 6 5 4 4-7 4 7 5-4-2 12H5ZM6 21h12" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </>
  ),
  external: (
    <>
      <path d="M7 17 17 7M7 7h10v10" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  play: <path d="m8 4 12 8-12 8Z" />,
  pause: (
    <>
      <path d="M8 4v16M16 4v16" />
    </>
  ),
  back: (
    <>
      <path d="M5 5v14M19 5l-10 7 10 7Z" />
    </>
  ),
  next: (
    <>
      <path d="M19 5v14M5 5l10 7-10 7Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  pin: (
    <>
      <path d="M18 9c0 5-6 12-6 12S6 14 6 9a6 6 0 0 1 12 0Z" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v7m0-11v1" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  mountain: (
    <>
      <path d="m2 20 8-15 5 9 2-4 5 10ZM7 11l3 2 3-2" />
    </>
  ),
};

export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.sun}
    </svg>
  );
}
