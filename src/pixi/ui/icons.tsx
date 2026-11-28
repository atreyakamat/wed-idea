const P: Record<string, string> = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  flip: "M4 8V5h3M20 16v3h-3M5 8a8 8 0 0 1 13-2M19 16a8 8 0 0 1-13 2",
  timer: "M12 8v5l3 2M9 2h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
  ratio: "M4 6h16v12H4zM8 10h4v4",
  grid: "M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16",
  tag: "M4 12V4h8l8 8-8 8-8-8ZM8.5 8.5h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  looks: "M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z",
  build: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4",
  roll: "M4 5h16v14H4zM4 9h16M4 15h16M8 5v14M16 5v14",
  share: "M12 4v11M8 8l4-4 4 4M5 14v5h14v-5",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 12 5 5 9-10",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  save: "M12 4v11M8 11l4 4 4-4M5 19h14",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  chevL: "m15 5-7 7 7 7",
  chevR: "m9 5 7 7-7 7",
  chevD: "m6 9 6 6 6-6",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4.5 20a7.5 7.5 0 0 1 15 0",
  wand: "M5 19 17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1ZM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7Z",
  sliders: "M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1M14 4v4M8 10v4M16 16v4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v4",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16 16l4 4",
  star: "m12 4 2.5 5.2 5.5.8-4 4 1 5.6L12 17l-5 2.6 1-5.6-4-4 5.5-.8Z",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14.5 5.5l4 4",
  plus: "M12 5v14M5 12h14",
  undo: "M9 7 4 12l5 5M4 12h9a6 6 0 0 1 0 12h-1",
  redo: "M15 7l5 5-5 5M20 12h-9a6 6 0 0 0 0 12h1",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3 1a8 8 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.3-1-2 3.4L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 1.7 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.7-1l2.3 1 2-3.4Z",
  heart: "M12 20s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6.2 5.5 5.5 0 0 1 21.5 11c-2.5 4.6-9.5 9-9.5 9Z",
  pin: "M12 21s6.5-5.8 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.2 6.5 11 6.5 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7.5h.01",
};
export type IconName = keyof typeof P;
export function I({ n, className = "h-5 w-5", w = 1.8, filled = false }: { n: IconName; className?: string; w?: number; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[n]} />
    </svg>
  );
}
