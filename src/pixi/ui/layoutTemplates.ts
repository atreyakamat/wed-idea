import { CAROUSEL_STYLES } from "./carouselStyles";
import type { Decor, Layout, Slot } from "./layouts";

const W = 600, H = 1800;

/** Evenly stacked photo windows between a header and a footer. */
const stack = (n: number, top: number, bottom: number, m = 40, gap = 12, r = 0): Slot[] => {
  const h = (H - top - bottom - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: m, y: Math.round(top + i * (h + gap)), w: W - m * 2, h: Math.round(h), r }));
};

/** A thin keyline around every photo, so the windows read as frames rather than pasted images. */
const frames = (slots: Slot[], color: string, lw = 3, pad = 0): Decor[] =>
  slots.map((s) => ({ k: "rect", x: s.x - pad, y: s.y - pad, w: s.w + pad * 2, h: s.h + pad * 2, r: s.r, stroke: color, lw }));

const f = (key: string, label: string, def: string, max = 24) => ({ key, label, def, max });

/* ---------------------------------------------------------------- */

const theaterSlots = stack(4, 212, 170);
const theater: Layout = {
  id: "st-theater", name: "Theatre Ticket", family: "Ticket", kind: "strip",
  blurb: "Deep red house ticket with a torn edge, a seat number and a star rating.",
  w: W, h: H, bg: "#7B1220", cut: "#ffffff",
  slots: theaterSlots,
  fields: [f("title", "Show title", "Theatre Show", 22), f("row", "Row", "B2", 4), f("seat", "Seat", "02", 4), f("footer", "Footer", "Save the best moment", 28)],
  under: [
    { k: "rect", x: 10, y: 10, w: W - 20, h: H - 20, r: 10, stroke: "#F0E2C4", lw: 3 },
    { k: "rect", x: 32, y: 36, w: W - 64, h: 150, r: 6, fill: "#F6EEDC" },
    { k: "text", x: W / 2, y: 92, t: "{title}", size: 42, color: "#7B1220", font: "serif", italic: true, align: "center" },
    { k: "line", x1: 60, y1: 112, x2: W - 60, y2: 112, color: "#7B1220", lw: 1.5 },
    { k: "text", x: 70, y: 140, t: "Row", size: 17, color: "#9A6B4F", font: "serif" },
    { k: "text", x: 70, y: 170, t: "{row}", size: 27, color: "#2B1A17", font: "serif", weight: "700" },
    { k: "text", x: 215, y: 140, t: "Seat", size: 17, color: "#9A6B4F", font: "serif" },
    { k: "text", x: 215, y: 170, t: "{seat}", size: 27, color: "#2B1A17", font: "serif", weight: "700" },
    { k: "text", x: W - 70, y: 140, t: "Date", size: 17, color: "#9A6B4F", font: "serif", align: "right" },
    { k: "text", x: W - 70, y: 170, t: "{date}", size: 22, color: "#2B1A17", font: "serif", weight: "700", align: "right" },
    ...frames(theaterSlots, "#F0E2C4", 3, 5),
  ],
  over: [
    { k: "stars", x: W / 2, y: 1668, n: 5, size: 13, gap: 12, color: "#F0E2C4", align: "center" },
    { k: "text", x: W / 2, y: 1718, t: "{footer}", size: 21, color: "#F6EEDC", font: "serif", align: "center", caps: true, track: 3 },
    { k: "line", x1: 150, y1: 1740, x2: W - 150, y2: 1740, color: "#C9A46A", lw: 1 },
    { k: "text", x: W / 2, y: 1772, t: "ADMIT ONE", size: 16, color: "#C9A46A", font: "sans", align: "center", track: 6 },
    { k: "perf", side: "both", r: 7, gap: 28, color: "#ffffff" },
  ],
};

const marqueeSlots = stack(3, 206, 216, 36, 14);
const marquee: Layout = {
  id: "st-marquee", name: "Movie Ticket", family: "Ticket", kind: "strip",
  blurb: "Navy cinema stub with a bold title bar, show times and a barcode.",
  w: W, h: H, bg: "#0E2C63", cut: "#ffffff",
  slots: marqueeSlots,
  fields: [f("title", "Title", "Movie Tickets", 20), f("sub", "Sub-line", "Admit one · Screen 01", 28), f("footer", "Footer", "Now Showing", 20)],
  under: [
    { k: "rect", x: 14, y: 14, w: W - 28, h: H - 28, r: 8, stroke: "#E8EDF7", lw: 2.5 },
    { k: "rect", x: 36, y: 40, w: W - 72, h: 92, r: 4, fill: "#E8EDF7" },
    { k: "text", x: W / 2, y: 104, t: "{title}", size: 44, color: "#0E2C63", font: "sans", weight: "800", align: "center", caps: true, track: 1 },
    { k: "text", x: W / 2, y: 166, t: "{sub}", size: 20, color: "#A9BEE4", font: "mono", align: "center", caps: true, track: 2 },
    ...frames(marqueeSlots, "#E8EDF7", 3, 5),
  ],
  over: [
    { k: "line", x1: 36, y1: 1612, x2: W - 36, y2: 1612, color: "#4C6DA8", lw: 1, dash: [8, 8] },
    { k: "text", x: 44, y: 1660, t: "{date}", size: 22, color: "#E8EDF7", font: "mono" },
    { k: "text", x: W - 44, y: 1660, t: "{time}", size: 22, color: "#E8EDF7", font: "mono", align: "right" },
    { k: "text", x: W / 2, y: 1706, t: "{footer}", size: 24, color: "#F2C14E", font: "sans", weight: "700", align: "center", caps: true, track: 5 },
    { k: "barcode", x: 150, y: 1726, w: 300, h: 42, color: "#E8EDF7", seed: 21 },
    { k: "notch", y: 196, r: 16, color: "#ffffff" },
  ],
};

const boardingSlots = stack(4, 228, 198, 44, 12, 4);
const boarding: Layout = {
  id: "st-boarding", name: "Boarding Pass", family: "Ticket", kind: "strip",
  blurb: "Airline stub in cream and red, with a route, a seat and a barcode tail.",
  w: W, h: H, bg: "#F6F2E9", cut: "#ffffff",
  slots: boardingSlots,
  fields: [f("from", "From", "GOA", 4), f("to", "To", "LAX", 4), f("title", "Airline", "Pixi Air", 16), f("seat", "Seat", "14A", 5)],
  under: [
    { k: "rect", x: 0, y: 0, w: W, h: 16, fill: "#C9282D" },
    { k: "text", x: 44, y: 76, t: "{title}", size: 28, color: "#C9282D", font: "sans", weight: "800", caps: true, track: 2 },
    { k: "text", x: W - 44, y: 76, t: "Boarding Pass", size: 16, color: "#8A8275", font: "mono", align: "right", caps: true, track: 2 },
    { k: "line", x1: 44, y1: 96, x2: W - 44, y2: 96, color: "#C8C0B0", lw: 1 },
    { k: "text", x: 44, y: 134, t: "From", size: 14, color: "#8A8275", font: "mono", caps: true, track: 2 },
    { k: "text", x: 44, y: 182, t: "{from}", size: 46, color: "#1D1B17", font: "sans", weight: "800" },
    { k: "text", x: W / 2, y: 170, t: "✈", size: 34, color: "#C9282D", align: "center" },
    { k: "text", x: W - 44, y: 134, t: "To", size: 14, color: "#8A8275", font: "mono", align: "right", caps: true, track: 2 },
    { k: "text", x: W - 44, y: 182, t: "{to}", size: 46, color: "#1D1B17", font: "sans", weight: "800", align: "right" },
    ...frames(boardingSlots, "#1D1B17", 2, 4),
  ],
  over: [
    { k: "line", x1: 0, y1: 1620, x2: W, y2: 1620, color: "#C8C0B0", lw: 2, dash: [10, 8] },
    { k: "text", x: 44, y: 1664, t: "Seat", size: 14, color: "#8A8275", font: "mono", caps: true, track: 2 },
    { k: "text", x: 44, y: 1700, t: "{seat}", size: 30, color: "#1D1B17", font: "sans", weight: "800" },
    { k: "text", x: W - 44, y: 1664, t: "Date", size: 14, color: "#8A8275", font: "mono", align: "right", caps: true, track: 2 },
    { k: "text", x: W - 44, y: 1700, t: "{date}", size: 22, color: "#1D1B17", font: "mono", align: "right" },
    { k: "barcode", x: 44, y: 1726, w: W - 88, h: 44, color: "#1D1B17", seed: 5 },
    { k: "perf", side: "both", r: 6, gap: 24, color: "#ffffff", from: 1620 },
  ],
};

const newsSlots = stack(4, 232, 150, 36, 14);
const newsprint: Layout = {
  id: "st-newsprint", name: "Front Page", family: "Paper", kind: "strip",
  blurb: "Newspaper front page with a masthead, column rules and a dateline.",
  w: W, h: H, bg: "#EDE7D7", cut: "#ffffff",
  slots: newsSlots,
  fields: [f("title", "Masthead", "The Story Today", 22), f("sub", "Headline", "A good evening, recorded", 34), f("footer", "Byline", "Photographed by us", 26)],
  under: [
    { k: "line", x1: 36, y1: 60, x2: W - 36, y2: 60, color: "#231F1A", lw: 4 },
    { k: "text", x: W / 2, y: 126, t: "{title}", size: 46, color: "#231F1A", font: "serif", weight: "700", align: "center" },
    { k: "line", x1: 36, y1: 148, x2: W - 36, y2: 148, color: "#231F1A", lw: 1.5 },
    { k: "text", x: 40, y: 172, t: "VOL. I", size: 14, color: "#5C564C", font: "serif", track: 2 },
    { k: "text", x: W / 2, y: 172, t: "{date}", size: 14, color: "#5C564C", font: "serif", align: "center", track: 2 },
    { k: "text", x: W - 40, y: 172, t: "PRICE: A SMILE", size: 14, color: "#5C564C", font: "serif", align: "right", track: 2 },
    { k: "line", x1: 36, y1: 186, x2: W - 36, y2: 186, color: "#231F1A", lw: 1.5 },
    { k: "text", x: W / 2, y: 218, t: "{sub}", size: 24, color: "#231F1A", font: "serif", italic: true, align: "center" },
    ...frames(newsSlots, "#231F1A", 2),
  ],
  over: [
    { k: "line", x1: 36, y1: 1676, x2: W - 36, y2: 1676, color: "#231F1A", lw: 1.5 },
    { k: "text", x: W / 2, y: 1716, t: "{footer}", size: 19, color: "#231F1A", font: "serif", align: "center", caps: true, track: 3 },
    { k: "text", x: W / 2, y: 1750, t: "continued inside", size: 15, color: "#5C564C", font: "serif", italic: true, align: "center" },
  ],
};

const classicSlots = stack(4, 42, 128, 28, 10);
const classic: Layout = {
  id: "st-classic", name: "Classic Booth", family: "Booth", kind: "strip",
  blurb: "The plain white strip a mall photobooth prints. Nothing but the photos.",
  w: W, h: H, bg: "#FFFFFF", cut: "#E9E6E0",
  slots: classicSlots,
  fields: [f("footer", "Footer", "Pixi", 18)],
  under: [],
  over: [
    { k: "text", x: W / 2, y: 1718, t: "{footer}", size: 24, color: "#1A1A1A", font: "mono", align: "center", caps: true, track: 8 },
    { k: "text", x: W / 2, y: 1754, t: "{date}", size: 16, color: "#8A8A8A", font: "mono", align: "center", track: 3 },
  ],
};

const slateSlots = stack(3, 268, 180, 40, 14);
const slate: Layout = {
  id: "st-slate", name: "Clapperboard", family: "Film", kind: "strip",
  blurb: "Film slate in black and white, with scene and take numbers.",
  w: W, h: H, bg: "#111113", cut: "#ffffff",
  slots: slateSlots,
  fields: [f("title", "Production", "Our Feature", 20), f("scene", "Scene", "01", 4), f("take", "Take", "03", 4)],
  under: [
    { k: "checker", x: 0, y: 0, w: W, h: 56, cell: 50, a: "#F2F2F2", b: "#111113" },
    { k: "text", x: W / 2, y: 128, t: "{title}", size: 40, color: "#F2F2F2", font: "sans", weight: "800", align: "center", caps: true, track: 2 },
    { k: "line", x1: 60, y1: 152, x2: W - 60, y2: 152, color: "#4A4A50", lw: 1 },
    { k: "text", x: 60, y: 186, t: "SCENE", size: 14, color: "#8A8A92", font: "mono", track: 3 },
    { k: "text", x: 60, y: 228, t: "{scene}", size: 34, color: "#F2F2F2", font: "mono", weight: "700" },
    { k: "text", x: W / 2, y: 186, t: "TAKE", size: 14, color: "#8A8A92", font: "mono", align: "center", track: 3 },
    { k: "text", x: W / 2, y: 228, t: "{take}", size: 34, color: "#F2F2F2", font: "mono", weight: "700", align: "center" },
    { k: "text", x: W - 60, y: 186, t: "DATE", size: 14, color: "#8A8A92", font: "mono", align: "right", track: 3 },
    { k: "text", x: W - 60, y: 228, t: "{date}", size: 22, color: "#F2F2F2", font: "mono", align: "right" },
    ...frames(slateSlots, "#F2F2F2", 3, 5),
  ],
  over: [
    { k: "stars", x: W / 2, y: 1674, n: 3, size: 15, gap: 18, color: "#F2C14E", align: "center" },
    { k: "checker", x: 0, y: H - 56, w: W, h: 56, cell: 50, a: "#111113", b: "#F2F2F2" },
  ],
};

const laceSlots = stack(4, 180, 170, 56, 12);
const lace: Layout = {
  id: "st-lace", name: "Lace Keepsake", family: "Vintage", kind: "strip",
  blurb: "Navy keepsake with a scalloped cream edge and a serif dedication.",
  w: W, h: H, bg: "#16233F", cut: "#ffffff",
  slots: laceSlots,
  fields: [f("title", "Title", "Keepsake", 20), f("footer", "Dedication", "With love, always", 28)],
  under: [
    { k: "scallop", side: "left", r: 15, color: "#F4EFE4" },
    { k: "scallop", side: "right", r: 15, color: "#F4EFE4" },
    { k: "text", x: W / 2, y: 92, t: "{title}", size: 42, color: "#F4EFE4", font: "serif", italic: true, align: "center" },
    { k: "line", x1: 180, y1: 118, x2: W - 180, y2: 118, color: "#C2A878", lw: 1 },
    { k: "text", x: W / 2, y: 150, t: "{date}", size: 17, color: "#C2A878", font: "serif", align: "center", track: 4 },
    ...frames(laceSlots, "#F4EFE4", 2, 6),
  ],
  over: [
    { k: "text", x: W / 2, y: 1700, t: "{footer}", size: 25, color: "#F4EFE4", font: "serif", italic: true, align: "center" },
    { k: "line", x1: 220, y1: 1726, x2: W - 220, y2: 1726, color: "#C2A878", lw: 1 },
  ],
};

const minimalSlots = stack(4, 136, 142, 44, 14, 6);
const minimal: Layout = {
  id: "st-minimal", name: "Raw Memories", family: "Modern", kind: "strip",
  blurb: "White, quiet and typographic. Lets the photographs do the talking.",
  w: W, h: H, bg: "#FFFFFF", cut: "#E9E6E0",
  slots: minimalSlots,
  fields: [f("title", "Title", "Raw Memories", 22), f("footer", "Footer", "", 26)],
  under: [
    { k: "text", x: 44, y: 76, t: "{title}", size: 26, color: "#111111", font: "sans", weight: "600" },
    { k: "text", x: W - 44, y: 76, t: "{date}", size: 16, color: "#9A9A9A", font: "mono", align: "right" },
    { k: "line", x1: 44, y1: 100, x2: W - 44, y2: 100, color: "#E2E2E2", lw: 1.5 },
  ],
  over: [
    { k: "line", x1: 44, y1: 1700, x2: W - 44, y2: 1700, color: "#E2E2E2", lw: 1.5 },
    { k: "text", x: 44, y: 1740, t: "{footer}", size: 16, color: "#6A6A6A", font: "sans" },
    { k: "text", x: W - 44, y: 1740, t: "PIXI", size: 16, color: "#111111", font: "sans", weight: "700", align: "right", track: 5 },
  ],
};

/* --- cards, not strips --- */

const CW = 620, CH = 760;
const gridSlots: Slot[] = [
  { x: 24, y: 24, w: 280, h: 280, r: 4 }, { x: 316, y: 24, w: 280, h: 280, r: 4 },
  { x: 24, y: 316, w: 280, h: 280, r: 4 }, { x: 316, y: 316, w: 280, h: 280, r: 4 },
];
const card: Layout = {
  id: "st-grid", name: "Four Square", family: "Card", kind: "card",
  blurb: "Four photos in a square card, easy to post as one picture.",
  w: CW, h: CH, bg: "#F4EFE6", cut: "#ffffff",
  slots: gridSlots,
  fields: [f("title", "Title", "Four Square", 22), f("footer", "Footer", "", 28)],
  under: frames(gridSlots, "#D8CEBE", 2, 3),
  over: [
    { k: "line", x1: 24, y1: 628, x2: CW - 24, y2: 628, color: "#D8CEBE", lw: 1.5 },
    { k: "text", x: 24, y: 672, t: "{title}", size: 28, color: "#1F1B16", font: "serif", weight: "700" },
    { k: "text", x: 24, y: 706, t: "{footer}", size: 17, color: "#7C7366", font: "sans" },
    { k: "text", x: CW - 24, y: 706, t: "{date}", size: 17, color: "#7C7366", font: "mono", align: "right" },
  ],
};

const PW = 600, PH = 730;
const polaroid: Layout = {
  id: "st-polaroid", name: "Instant Print", family: "Card", kind: "card",
  blurb: "One photo on a thick white card, with room to write underneath.",
  w: PW, h: PH, bg: "#FCFBF7", cut: "#E9E6E0",
  slots: [{ x: 38, y: 38, w: PW - 76, h: 524, r: 2 }],
  fields: [f("footer", "Caption", "A good day", 30)],
  under: [{ k: "rect", x: 38, y: 38, w: PW - 76, h: 524, r: 2, stroke: "#E4DED2", lw: 2 }],
  over: [
    { k: "text", x: PW / 2, y: 638, t: "{footer}", size: 32, color: "#1F1B16", font: "serif", italic: true, align: "center" },
    { k: "text", x: PW / 2, y: 682, t: "{date}", size: 16, color: "#9A9387", font: "mono", align: "center", track: 3 },
  ],
};

const filmstrip: Layout = {
  id: "st-film", name: "35mm Negative", family: "Film", kind: "strip",
  blurb: "A length of film with sprocket holes and frame numbers down the edge.",
  w: W, h: H, bg: "#1A1714", cut: "#ffffff",
  slots: stack(4, 70, 70, 74, 18, 2),
  fields: [f("title", "Roll name", "PIXI 400", 14)],
  under: [
    { k: "sprocket", side: "both", color: "#D8CDBA", w: 18, h: 24, gap: 22 },
    ...frames(stack(4, 70, 70, 74, 18, 2), "#4A423A", 2, 4),
  ],
  over: [
    { k: "text", x: W / 2, y: 44, t: "{title}", size: 20, color: "#E6A23C", font: "mono", align: "center", track: 6 },
    { k: "text", x: W / 2, y: H - 28, t: "{date}", size: 17, color: "#E6A23C", font: "mono", align: "center", track: 4 },
  ],
};

/* ---------------------------------------------------------------- */
/* Carousels. One page per photo, at the 4:5 Instagram posts at full width.           */
/* ---------------------------------------------------------------- */

const QW = 1080, QH = 1350;
/** No ceiling on pages: Build keeps only the pages near the one on screen in memory and exports one at a time. */
const SLIDES = { min: 1, max: 9999 };

/** The warm, slightly faded cast of a print that has sat in a drawer. Drawn over everything. */
const aged = (grain: number, warmth = 0.1): Decor[] => [
  { k: "wash", color: "#D8A76A", alpha: warmth, mode: "soft-light" },
  { k: "grain", amount: grain, seed: 11 },
];

const instant: Layout = {
  id: "ca-instant", name: "Instant", family: "Carousel", kind: "carousel",
  blurb: "A thick white border with room to write underneath. The one most people reach for.",
  w: QW, h: QH, bg: "#FBF8F2", cut: "#ffffff", slides: SLIDES, exportScale: 1,
  slots: [{ x: 70, y: 70, w: 940, h: 1020, r: 2 }],
  fields: [f("caption", "Caption", "", 60), f("footer", "Footer", "", 24)],
  under: [{ k: "rect", x: 70, y: 70, w: 940, h: 1020, r: 2, stroke: "#E6DFD1", lw: 2 }],
  over: [
    { k: "text", x: QW / 2, y: 1182, t: "{caption}", size: 42, color: "#221E18", font: "serif", italic: true, align: "center", wrap: 860, lh: 50 },
    { k: "text", x: 70, y: 1292, t: "{footer}", size: 24, color: "#9A9185", font: "mono", track: 2 },
    { k: "text", x: QW - 70, y: 1292, t: "{index}/{total}", size: 24, color: "#9A9185", font: "mono", align: "right", track: 2 },
    ...aged(0.17),
  ],
};

const fullFrame: Layout = {
  id: "ca-full", name: "Full Frame", family: "Carousel", kind: "carousel",
  blurb: "Edge to edge, with the caption laid over a soft shadow at the foot.",
  w: QW, h: QH, bg: "#0B0B0C", cut: "#000000", slides: SLIDES, exportScale: 1,
  slots: [{ x: 0, y: 0, w: QW, h: QH }],
  fields: [f("caption", "Caption", "", 60)],
  under: [],
  over: [
    { k: "rect", x: 0, y: 880, w: QW, h: 470, fill: { grad: "v", stops: [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.86)"]] } },
    { k: "text", x: 72, y: 1218, t: "{caption}", size: 48, color: "#FFFFFF", font: "sans", weight: "700", wrap: 820, lh: 58, up: true },
    { k: "text", x: 72, y: 1288, t: "{date}", size: 23, color: "rgba(255,255,255,.62)", font: "mono", track: 3 },
    { k: "pill", x: QW - 56, y: 56, t: "{index}/{total}", size: 26, fg: "#111111", bg: "rgba(255,255,255,.92)", align: "right" },
    { k: "vignette", strength: 0.3, soft: 0.6 },
    ...aged(0.1, 0.07),
  ],
};

const postcard: Layout = {
  id: "ca-post", name: "Postcard", family: "Carousel", kind: "carousel",
  blurb: "A square photo on cream board, with a serif line and the date underneath.",
  w: QW, h: QH, bg: "#F2EADA", cut: "#ffffff", slides: SLIDES, exportScale: 1,
  slots: [{ x: 80, y: 86, w: 920, h: 920, r: 3 }],
  fields: [f("title", "Title", "", 30), f("caption", "Caption", "", 60)],
  under: [{ k: "rect", x: 80, y: 86, w: 920, h: 920, r: 3, stroke: "#D9CDB6", lw: 2.5 }],
  over: [
    { k: "text", x: 80, y: 1084, t: "{title}", size: 34, color: "#8A7A5C", font: "sans", weight: "600", caps: true, track: 5 },
    { k: "text", x: 80, y: 1146, t: "{caption}", size: 40, color: "#241F17", font: "serif", italic: true, wrap: 920, lh: 48 },
    { k: "line", x1: 80, y1: 1238, x2: QW - 80, y2: 1238, color: "#D9CDB6", lw: 2 },
    { k: "text", x: 80, y: 1288, t: "{date}", size: 23, color: "#8A7A5C", font: "mono", track: 2 },
    { k: "text", x: QW - 80, y: 1288, t: "{index}/{total}", size: 23, color: "#8A7A5C", font: "mono", align: "right", track: 2 },
    ...aged(0.18, 0.14),
  ],
};

const mounted: Layout = {
  id: "ca-slide", name: "Mounted Slide", family: "Carousel", kind: "carousel",
  blurb: "A square of film in a dark mount, sprocket holes down both edges.",
  w: QW, h: QH, bg: "#17140F", cut: "#ffffff", slides: SLIDES, exportScale: 1,
  slots: [{ x: 124, y: 248, w: 832, h: 832, r: 2 }],
  fields: [f("title", "Roll name", "PIXI 400", 16), f("caption", "Caption", "", 48)],
  under: [
    { k: "sprocket", side: "both", color: "#D8CDBA", w: 30, h: 40, gap: 34 },
    { k: "rect", x: 124, y: 248, w: 832, h: 832, r: 2, stroke: "#4A423A", lw: 3 },
  ],
  over: [
    { k: "text", x: QW / 2, y: 168, t: "{title}", size: 34, color: "#E6A23C", font: "mono", align: "center", track: 10 },
    { k: "text", x: QW / 2, y: 1172, t: "{caption}", size: 36, color: "#EFE7D8", font: "mono", align: "center", wrap: 800, lh: 46, up: true },
    { k: "text", x: QW / 2, y: 1250, t: "{date}  ·  {index}/{total}", size: 22, color: "#8A8074", font: "mono", align: "center", track: 4 },
    ...aged(0.14, 0.06),
  ],
};

/* ---------------------------------------------------------------- */
/* Contact sheet. A whole roll on one page, the way a darkroom prints it.              */
/* ---------------------------------------------------------------- */

const CS_COLS = 3, CS_ROWS = 4, CS_M = 48, CS_GAP = 14;
const CS_W = Math.round((QW - CS_M * 2 - CS_GAP * (CS_COLS - 1)) / CS_COLS);
const CS_H = Math.round(CS_W * 0.75);
const CS_TOP = 158, CS_PITCH = CS_H + 26 + CS_GAP;
const sheetSlots: Slot[] = Array.from({ length: CS_COLS * CS_ROWS }, (_, i) => ({
  x: CS_M + (i % CS_COLS) * (CS_W + CS_GAP),
  y: CS_TOP + Math.floor(i / CS_COLS) * CS_PITCH,
  w: CS_W, h: CS_H,
}));
const sheetNumbers: Decor[] = sheetSlots.map((s, i) => ({
  k: "text", x: s.x, y: s.y + s.h + 19, t: String(i + 1).padStart(2, "0"), size: 15, color: "#8A8074", font: "mono", track: 2,
}));

const contact: Layout = {
  id: "sh-contact", name: "Contact Sheet", family: "Sheet", kind: "sheet",
  blurb: "Twelve frames on one page with numbers, the way a roll is proofed.",
  w: QW, h: QH, bg: "#16140F", cut: "#ffffff", exportScale: 1,
  slots: sheetSlots,
  fields: [f("title", "Roll name", "Contact Sheet", 24), f("footer", "Footer", "PIXI", 18)],
  under: [
    { k: "text", x: CS_M, y: 86, t: "{title}", size: 38, color: "#EFE7D8", font: "mono", weight: "700", track: 3 },
    { k: "text", x: QW - CS_M, y: 86, t: "{date}", size: 24, color: "#8A8074", font: "mono", align: "right", track: 2 },
    { k: "line", x1: CS_M, y1: 114, x2: QW - CS_M, y2: 114, color: "#3A352C", lw: 2 },
    ...sheetSlots.map((s): Decor => ({ k: "rect", x: s.x, y: s.y, w: s.w, h: s.h, stroke: "#3A352C", lw: 2 })),
  ],
  over: [
    ...sheetNumbers,
    { k: "line", x1: CS_M, y1: 1268, x2: QW - CS_M, y2: 1268, color: "#3A352C", lw: 2 },
    { k: "text", x: CS_M, y: 1310, t: "{footer}", size: 22, color: "#E6A23C", font: "mono", track: 8 },
    { k: "grain", amount: 0.1, seed: 5 },
  ],
};

/* The modern set: what feeds look like now. Clean type, big radii, the photo doing the work. */

const glass: Layout = {
  id: "ca-glass", name: "Glass", family: "Carousel", kind: "carousel",
  blurb: "Your photo, sharp, floating over a soft blur of itself. Works with any picture.",
  w: QW, h: QH, bg: "#111111", cut: "#000000", slides: SLIDES, exportScale: 1,
  slots: [{ x: 96, y: 132, w: 888, h: 888, r: 60, shadow: 60 }],
  fields: [f("caption", "Caption", "", 60)],
  under: [{ k: "backdrop", dim: 0.34 }],
  over: [
    { k: "rect", x: 96, y: 132, w: 888, h: 888, r: 60, stroke: "rgba(255,255,255,.28)", lw: 2 },
    { k: "text", x: QW / 2, y: 1128, t: "{caption}", size: 44, color: "#FFFFFF", font: "sans", weight: "600", align: "center", wrap: 880, lh: 54 },
    { k: "pill", x: QW / 2, y: 1262, t: "{index} / {total}", size: 24, fg: "#FFFFFF", bg: "rgba(255,255,255,.18)", align: "center" },
    { k: "grain", amount: 0.06, seed: 5 },
  ],
};

const noir: Layout = {
  id: "ca-noir", name: "Noir", family: "Carousel", kind: "carousel",
  blurb: "Black, rounded, bold. The caption in heavy type under a big photo.",
  w: QW, h: QH, bg: "#0A0A0B", cut: "#000000", slides: SLIDES, exportScale: 1,
  slots: [{ x: 56, y: 56, w: 968, h: 1000, r: 48 }],
  fields: [f("caption", "Caption", "", 60)],
  under: [],
  over: [
    { k: "text", x: 64, y: 1150, t: "{caption}", size: 50, color: "#FFFFFF", font: "sans", weight: "700", wrap: 950, lh: 58 },
    { k: "text", x: 64, y: 1294, t: "{index2} — {total2}", size: 24, color: "rgba(255,255,255,.5)", font: "mono", track: 4 },
    { k: "text", x: QW - 64, y: 1294, t: "{date}", size: 24, color: "rgba(255,255,255,.5)", font: "mono", align: "right", track: 3 },
    { k: "grain", amount: 0.05, seed: 9 },
  ],
};

const editorial: Layout = {
  id: "ca-editorial", name: "Editorial", family: "Carousel", kind: "carousel",
  blurb: "A magazine page: a big serif number, a thin rule, and room to breathe.",
  w: QW, h: QH, bg: "#F4F1EA", cut: "#ffffff", slides: SLIDES, exportScale: 1,
  slots: [{ x: 72, y: 300, w: 936, h: 800 }],
  fields: [f("title", "Section", "", 26), f("caption", "Caption", "", 70)],
  under: [],
  over: [
    { k: "text", x: 64, y: 222, t: "{index2}", size: 200, color: "#1B1917", font: "serif" },
    { k: "text", x: QW - 72, y: 126, t: "{title}", size: 24, color: "#8A8378", font: "sans", weight: "600", caps: true, track: 6, align: "right" },
    { k: "text", x: QW - 72, y: 222, t: "of {total2}", size: 30, color: "#8A8378", font: "serif", italic: true, align: "right" },
    { k: "line", x1: 72, y1: 258, x2: QW - 72, y2: 258, color: "#1B1917", lw: 3 },
    { k: "text", x: 72, y: 1178, t: "{caption}", size: 40, color: "#1B1917", font: "serif", italic: true, wrap: 936, lh: 50 },
    { k: "text", x: 72, y: 1300, t: "{date}", size: 22, color: "#8A8378", font: "mono", track: 3 },
    { k: "grain", amount: 0.05, seed: 3 },
  ],
};

const dump: Layout = {
  id: "ca-dump", name: "Photo Dump", family: "Carousel", kind: "carousel",
  blurb: "A print dropped on the table, a little crooked, with a strip of tape. For the camera-roll post.",
  w: QW, h: QH, bg: "#E9E6DF", cut: "#ffffff", slides: SLIDES, exportScale: 1,
  slots: [{ x: 150, y: 150, w: 780, h: 800, rot: -2.4, shadow: 36, mat: { w: 34, color: "#FFFEFA", foot: 120 } }],
  fields: [f("caption", "Caption", "", 48)],
  under: [],
  over: [
    { k: "rect", x: 455, y: 88, w: 170, h: 54, r: 3, fill: "rgba(222,205,150,.72)" },
    { k: "text", x: QW / 2, y: 1204, t: "{caption}", size: 44, color: "#2A2622", font: "serif", italic: true, align: "center", wrap: 860, lh: 52 },
    { k: "text", x: QW / 2, y: 1306, t: "{index} / {total}", size: 22, color: "#8F887C", font: "mono", align: "center", track: 4 },
    { k: "grain", amount: 0.08, seed: 14 },
  ],
};

/* ---------------------------------------------------------------- */
/* Prints. Drawn at one third of 300 DPI and exported at three times, so a 4×6 comes   */
/* out at 1200×1800 and an A4 sticker sheet at 2481×3507.                               */
/* ---------------------------------------------------------------- */

const DPI3 = 100; // layout pixels per inch; ×3 on export = 300 DPI
/** Two short lines in a corner, just inside the page so the clip does not eat them. */
const crop = (x: number, y: number, dx: number, dy: number, len = 14, color = "#111111"): Decor[] => [
  { k: "line", x1: x + dx * 10, y1: y + dy * 4, x2: x + dx * 10, y2: y + dy * (4 + len), color, lw: 1 },
  { k: "line", x1: x + dx * 4, y1: y + dy * 10, x2: x + dx * (4 + len), y2: y + dy * 10, color, lw: 1 },
];
/** Registration marks in all four corners, outside the trim. */
const cropMarks = (w: number, h: number, color?: string): Decor[] => [
  ...crop(0, 0, 1, 1, 14, color), ...crop(w, 0, -1, 1, 14, color), ...crop(0, h, 1, -1, 14, color), ...crop(w, h, -1, -1, 14, color),
];

const P46W = 4 * DPI3, P46H = 6 * DPI3;
const print4x6: Layout = {
  id: "pr-4x6", name: "4 × 6 Print", family: "Print", kind: "print", paper: "4×6 in",
  blurb: "One photo with a thin white margin, sized for a 4×6 lab print or a booth hand-out.",
  w: P46W, h: P46H, bg: "#ffffff", cut: "#ffffff", exportScale: 3, note: "1200 × 1800 · 300 DPI",
  slots: [{ x: 18, y: 18, w: P46W - 36, h: P46H - 36 - 30 }],
  fields: [f("caption", "Caption", "", 26)],
  under: [],
  over: [
    { k: "text", x: 18, y: P46H - 22, t: "{caption}", size: 11, color: "#444444", font: "sans", track: 1, wrap: 270, lh: 13, up: true },
    { k: "text", x: P46W - 18, y: P46H - 22, t: "{date}", size: 9, color: "#999999", font: "mono", align: "right", track: 1 },
  ],
};

const P810W = 8 * DPI3, P810H = 10 * DPI3;
const print8x10: Layout = {
  id: "pr-8x10", name: "8 × 10 Print", family: "Print", kind: "print", paper: "8×10 in",
  blurb: "A wide matte around one photo, the way a framed print sits. Room for a title under it.",
  w: P810W, h: P810H, bg: "#F7F4EE", cut: "#ffffff", exportScale: 3, note: "2400 × 3000 · 300 DPI",
  slots: [{ x: 80, y: 80, w: P810W - 160, h: P810H - 160 - 70, r: 1 }],
  fields: [f("title", "Title", "", 28)],
  under: [
    { k: "rect", x: 74, y: 74, w: P810W - 148, h: P810H - 148 - 70, stroke: "#D9D3C8", lw: 1 },
  ],
  over: [
    { k: "text", x: P810W / 2, y: P810H - 96, t: "{title}", size: 20, color: "#2A2622", font: "serif", italic: true, align: "center" },
    { k: "text", x: P810W / 2, y: P810H - 66, t: "{date}", size: 10, color: "#9A9185", font: "mono", align: "center", track: 3 },
  ],
};

/** A4 at 100 px/in: 8.27 × 11.69 in. */
const A4W = 827, A4H = 1169;
const BLEED = 6; // 1.5 mm at 300 DPI: the printed body runs this far past the cut line
/** Grid of sticker bodies: the sticker is the slot; the cut line sits BLEED inside its edge. */
const stickerGrid = (cols: number, rows: number, size: number, r: number) => {
  const gapX = (A4W - cols * size) / (cols + 1), gapY = (A4H - 90 - rows * size) / (rows + 1);
  const slots: Slot[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) slots.push({ x: Math.round(gapX + i * (size + gapX)), y: Math.round(50 + gapY + j * (size + gapY)), w: size, h: size, r });
  const cuts: Decor[] = slots.map((s) => ({ k: "rect", x: s.x + BLEED, y: s.y + BLEED, w: s.w - BLEED * 2, h: s.h - BLEED * 2, r: Math.max(0, s.r! - BLEED), stroke: "#E0245E", lw: 0.8, dash: [4, 3] }));
  return { slots, cuts };
};

const sq = stickerGrid(3, 4, 220, 26);
const stickerSquares: Layout = {
  id: "pr-stickers", name: "Sticker Sheet", family: "Print", kind: "print", paper: "A4",
  blurb: "Twelve rounded square stickers on A4 with bleed and a magenta cut line, ready for a cutter or scissors.",
  w: A4W, h: A4H, bg: "#ffffff", cut: "#ffffff", exportScale: 3, note: "A4 · 300 DPI · 12 stickers",
  slots: sq.slots,
  fields: [f("footer", "Sheet label", "PIXI STICKERS", 28)],
  under: sq.slots.map((s): Decor => ({ k: "rect", x: s.x - 3, y: s.y - 3, w: s.w + 6, h: s.h + 6, r: s.r! + 3, fill: "#ffffff", stroke: "#EEEEEE", lw: 1 })),
  over: [
    ...sq.cuts,
    ...cropMarks(A4W, A4H),
    { k: "text", x: 40, y: A4H - 26, t: "{footer}", size: 11, color: "#777777", font: "mono", track: 3 },
    { k: "text", x: A4W - 40, y: A4H - 26, t: "CUT ON DASHED LINE · 1.5 MM BLEED · {date}", size: 8, color: "#AAAAAA", font: "mono", align: "right", track: 1 },
  ],
};

const rd = stickerGrid(3, 3, 236, 118);
const stickerRounds: Layout = {
  id: "pr-stickers-round", name: "Round Stickers", family: "Print", kind: "print", paper: "A4",
  blurb: "Nine circle stickers on A4, the badge-and-laptop kind, with bleed and a cut line.",
  w: A4W, h: A4H, bg: "#ffffff", cut: "#ffffff", exportScale: 3, note: "A4 · 300 DPI · 9 stickers",
  slots: rd.slots,
  fields: [f("footer", "Sheet label", "PIXI STICKERS", 28)],
  under: rd.slots.map((s): Decor => ({ k: "rect", x: s.x - 3, y: s.y - 3, w: s.w + 6, h: s.h + 6, r: s.r! + 3, fill: "#ffffff", stroke: "#EEEEEE", lw: 1 })),
  over: [
    ...rd.cuts,
    ...cropMarks(A4W, A4H),
    { k: "text", x: 40, y: A4H - 26, t: "{footer}", size: 11, color: "#777777", font: "mono", track: 3 },
    { k: "text", x: A4W - 40, y: A4H - 26, t: "CUT ON DASHED LINE · 1.5 MM BLEED · {date}", size: 8, color: "#AAAAAA", font: "mono", align: "right", track: 1 },
  ],
};

/* ---------------------------------------------------------------- */

export const LAYOUTS: Layout[] = [
  // strips
  classic, theater, marquee, boarding, newsprint, slate, lace, minimal, filmstrip,
  // cards
  card, polaroid,
  // carousels: the eight built in, then the twenty-two that live in carouselStyles.ts
  instant, glass, noir, editorial, dump, fullFrame, postcard, mounted,
  ...CAROUSEL_STYLES,
  // sheets
  contact,
  // prints
  print4x6, print8x10, stickerSquares, stickerRounds,
];

/** Older name, so anything that still says "strip templates" keeps working. */
export const STRIP_TEMPLATES = LAYOUTS;

export const layoutById = (id: string) => LAYOUTS.find((t) => t.id === id) ?? LAYOUTS[0];
export const stripById = layoutById;

export const byKind = (k: Layout["kind"]) => LAYOUTS.filter((t) => t.kind === k);
