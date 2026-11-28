import type { Layout } from "./layouts";

/**
 * Twenty-two more carousel frames, on top of the eight the app shipped with.
 *
 * Each one is data, not code: a background, where the photo sits, and what is drawn over it. They
 * are kept here rather than in layoutTemplates.ts only because that file was already long.
 *
 * Instagram serves a 4:5 post at 1080×1350, a square at 1080×1080 and a story at 1080×1920, so a
 * style is built at the shape it is meant to be posted at. The size is the frame's job: stretching
 * one shape into another is what makes a carousel look wrong, so Square and Story are their own
 * frames instead of a setting that squashes the others.
 */

const QW = 1080, QH = 1350;   // 4:5, the post shape
const SW = 1080, SH = 1080;   // square
const TW = 1080, TH = 1920;   // story
const SLIDES = { min: 1, max: 9999 };

const f = (key: string, label: string, def: string, max = 24) => ({ key, label, def, max });

/** Common shape of a carousel frame, so each style below only states what makes it itself. */
const base = { family: "Carousel" as const, kind: "carousel" as const, slides: SLIDES, exportScale: 1 };

// ---------------------------------------------------------------- panorama

const panorama: Layout = {
  ...base,
  id: "ca-pano", name: "Panorama", w: QW, h: QH, bg: "#0B0B0C", cut: "#000000",
  blurb: "One photo stretched across every page, so it runs on unbroken as you swipe.",
  slots: [{ x: 0, y: 135, w: QW, h: 1080, pan: true }],
  fields: [f("caption", "Caption", "", 50)],
  under: [],
  over: [
    { k: "text", x: QW / 2, y: 90, t: "{caption}", size: 38, color: "rgba(255,255,255,.92)", font: "sans", weight: "600", align: "center", wrap: 960 },
    { k: "text", x: QW / 2, y: 1285, t: "swipe  ·  {index} / {total}", size: 24, color: "rgba(255,255,255,.4)", font: "mono", align: "center", track: 4 },
    { k: "grain", amount: 0.05, seed: 21 },
  ],
};

const filmRoll: Layout = {
  ...base,
  id: "ca-filmroll", name: "Film Roll", w: QW, h: QH, bg: "#17150F", cut: "#000000",
  blurb: "A strip of film with the sprocket holes running on from page to page.",
  slots: [{ x: 70, y: 250, w: 940, h: 850, pan: true }],
  fields: [f("caption", "Caption", "", 40)],
  under: [],
  over: [
    { k: "sprocket", side: "both", color: "#E8E2D0", w: 34, h: 48, gap: 76 },
    { k: "text", x: 70, y: 196, t: "{caption}", size: 34, color: "#E8E2D0", font: "mono", caps: true, track: 4 },
    { k: "text", x: QW - 70, y: 196, t: "{index2}", size: 34, color: "#D9A441", font: "mono", align: "right", track: 4 },
    { k: "text", x: 70, y: 1180, t: "KODACHROME 64", size: 24, color: "rgba(232,226,208,.45)", font: "mono", track: 6 },
    { k: "text", x: QW - 70, y: 1180, t: "{date}", size: 24, color: "rgba(232,226,208,.45)", font: "mono", align: "right", track: 3 },
    { k: "grain", amount: 0.1, seed: 4 },
  ],
};

// ---------------------------------------------------------------- prints and paper

const polaroidStack: Layout = {
  ...base,
  id: "ca-stack", name: "Polaroid Stack", w: QW, h: QH, bg: "#DED9CF", cut: "#ffffff",
  blurb: "Two prints dropped on top of each other, the top one straight enough to read.",
  slots: [
    { x: 215, y: 215, w: 650, h: 650, rot: 5.5, shadow: 30, mat: { w: 40, color: "#FBF9F3", foot: 130 } },
    { x: 180, y: 260, w: 700, h: 700, rot: -3, shadow: 40, mat: { w: 42, color: "#FFFEFA", foot: 140 } },
  ],
  fields: [f("caption", "Caption", "", 40)],
  under: [],
  over: [
    { k: "text", x: QW / 2, y: 1220, t: "{caption}", size: 42, color: "#2B2722", font: "serif", italic: true, align: "center", wrap: 840 },
    { k: "text", x: QW / 2, y: 1300, t: "{index} / {total}", size: 22, color: "#8D877B", font: "mono", align: "center", track: 4 },
    { k: "grain", amount: 0.07, seed: 11 },
  ],
};

const travelPostcard: Layout = {
  ...base,
  id: "ca-travel", name: "Travel Postcard", w: QW, h: QH, bg: "#F3EEE2", cut: "#ffffff",
  blurb: "A card home: a stamp, a postmark and a line in handwriting.",
  slots: [{ x: 70, y: 70, w: 940, h: 820, r: 6 }],
  fields: [f("title", "Place", "", 24), f("caption", "Note", "", 70)],
  under: [],
  over: [
    { k: "rect", x: 70, y: 70, w: 940, h: 820, r: 6, stroke: "rgba(0,0,0,.12)", lw: 3 },
    { k: "rect", x: 828, y: 946, w: 160, h: 190, r: 4, fill: "#E7DFCB", stroke: "#C9BFA6", lw: 3, dash: [9, 7] },
    { k: "text", x: 908, y: 1052, t: "PIXI", size: 26, color: "#9A8F77", font: "mono", align: "center", track: 5 },
    { k: "text", x: 70, y: 1000, t: "{title}", size: 54, color: "#23201B", font: "serif", italic: true },
    { k: "line", x1: 70, y1: 1040, x2: 780, y2: 1040, color: "rgba(0,0,0,.18)", lw: 2 },
    { k: "text", x: 70, y: 1096, t: "{caption}", size: 32, color: "#4A443A", font: "serif", wrap: 700, lh: 44 },
    { k: "text", x: 70, y: 1292, t: "{date}  ·  {index} of {total}", size: 24, color: "#8D8372", font: "mono", track: 3 },
    { k: "grain", amount: 0.06, seed: 7 },
  ],
};

const ticketStub: Layout = {
  ...base,
  id: "ca-ticket", name: "Ticket Stub", w: QW, h: QH, bg: "#E9E3D4", cut: "#ffffff",
  blurb: "Admit one: a torn edge, a serial number and a barcode down the bottom.",
  slots: [{ x: 96, y: 210, w: 888, h: 740 }],
  fields: [f("title", "Event", "ADMIT ONE", 24), f("caption", "Line", "", 44)],
  under: [],
  over: [
    { k: "perf", side: "both", r: 14, gap: 44, color: "#0B0B0C" },
    { k: "text", x: 96, y: 150, t: "{title}", size: 42, color: "#1A1813", font: "slab", caps: true, track: 5 },
    { k: "line", x1: 96, y1: 176, x2: QW - 96, y2: 176, color: "#1A1813", lw: 3, dash: [12, 9] },
    { k: "text", x: 96, y: 1024, t: "{caption}", size: 36, color: "#1A1813", font: "slab", wrap: 880 },
    { k: "barcode", x: 96, y: 1130, w: 520, h: 96, color: "#1A1813", seed: 31 },
    { k: "text", x: QW - 96, y: 1160, t: "No. {index2}", size: 44, color: "#1A1813", font: "mono", align: "right", track: 2 },
    { k: "text", x: QW - 96, y: 1210, t: "of {total2}", size: 26, color: "#6E675A", font: "mono", align: "right", track: 2 },
    { k: "grain", amount: 0.08, seed: 17 },
  ],
};

const zine: Layout = {
  ...base,
  id: "ca-zine", name: "Zine", w: QW, h: QH, bg: "#EFEDE6", cut: "#ffffff",
  blurb: "Photocopied and cut out: hard shadows, taped corners, letters that do not line up.",
  slots: [{ x: 110, y: 230, w: 860, h: 780, rot: -1.6, shadow: 22 }],
  fields: [f("title", "Headline", "", 20), f("caption", "Line", "", 44)],
  under: [],
  over: [
    { k: "rect", x: 0, y: 92, w: QW, h: 96, fill: "#12110F" },
    { k: "text", x: 60, y: 160, t: "{title}", size: 62, color: "#F6F4EC", font: "slab", caps: true, track: 2 },
    { k: "rect", x: 86, y: 206, w: 150, h: 46, r: 2, fill: "rgba(210,196,160,.75)" },
    { k: "rect", x: 846, y: 988, w: 150, h: 46, r: 2, fill: "rgba(210,196,160,.75)" },
    { k: "rect", x: 110, y: 1076, w: 400, h: 70, fill: "#12110F" },
    { k: "text", x: 134, y: 1126, t: "{caption}", size: 38, color: "#F6F4EC", font: "mono", caps: true },
    { k: "text", x: QW - 110, y: 1270, t: "{index2}/{total2}", size: 46, color: "#12110F", font: "slab", align: "right", track: 2 },
    { k: "grain", amount: 0.14, seed: 23 },
  ],
};

const newsprint: Layout = {
  ...base,
  id: "ca-news", name: "Newsprint", w: QW, h: QH, bg: "#EDE8DC", cut: "#ffffff",
  blurb: "Printed on a press: the photo broken into ink dots under a headline column.",
  slots: [{ x: 72, y: 300, w: 936, h: 720 }],
  fields: [f("title", "Headline", "", 30), f("caption", "Standfirst", "", 80)],
  under: [],
  over: [
    // A coarse screen. Finer than this and the dots merge into a grey mesh on a phone instead of
    // reading as printed ink.
    { k: "halftone", x: 72, y: 300, w: 936, h: 720, cell: 16, color: "#17150F", amount: 1 },
    { k: "text", x: 72, y: 120, t: "THE PIXI TIMES", size: 28, color: "#17150F", font: "serif", weight: "700", caps: true, track: 8 },
    { k: "line", x1: 72, y1: 142, x2: QW - 72, y2: 142, color: "#17150F", lw: 4 },
    // A newspaper headline is a heavy serif, not the typewriter face "slab" maps to.
    { k: "text", x: 72, y: 230, t: "{title}", size: 74, color: "#17150F", font: "serif", weight: "700", wrap: 936, lh: 78 },
    { k: "line", x1: 72, y1: 1062, x2: QW - 72, y2: 1062, color: "rgba(23,21,15,.35)", lw: 2 },
    { k: "text", x: 72, y: 1120, t: "{caption}", size: 32, color: "#2E2A20", font: "serif", wrap: 936, lh: 42 },
    { k: "text", x: 72, y: 1296, t: "PAGE {index2}", size: 24, color: "#6B6455", font: "serif", caps: true, track: 5 },
    { k: "text", x: QW - 72, y: 1296, t: "{date}", size: 24, color: "#6B6455", font: "mono", align: "right", track: 3 },
    { k: "grain", amount: 0.1, seed: 2 },
  ],
};

const stickerSheet: Layout = {
  ...base,
  id: "ca-stickers", name: "Sticker Sheet", w: QW, h: QH, bg: "#F2C84B", cut: "#ffffff",
  blurb: "Die-cut shapes on a coloured backing sheet, ready to peel.",
  slots: [
    { x: 96, y: 230, w: 400, h: 400, r: 200, mat: { w: 16, color: "#FFFDF6" } },
    { x: 584, y: 230, w: 400, h: 400, r: 44, mat: { w: 16, color: "#FFFDF6" } },
    { x: 96, y: 700, w: 400, h: 400, r: 44, mat: { w: 16, color: "#FFFDF6" } },
    { x: 584, y: 700, w: 400, h: 400, r: 200, mat: { w: 16, color: "#FFFDF6" } },
  ],
  fields: [f("title", "Sheet name", "", 24)],
  under: [],
  over: [
    { k: "text", x: QW / 2, y: 160, t: "{title}", size: 52, color: "#1D1A12", font: "sans", weight: "800", align: "center", caps: true, track: 3 },
    { k: "text", x: QW / 2, y: 1210, t: "peel & stick", size: 30, color: "rgba(29,26,18,.6)", font: "mono", align: "center", track: 6 },
    { k: "text", x: QW / 2, y: 1286, t: "sheet {index} of {total}", size: 24, color: "rgba(29,26,18,.45)", font: "mono", align: "center", track: 3 },
  ],
};

// ---------------------------------------------------------------- camera bodies

const digicam: Layout = {
  ...base,
  id: "ca-digicam", name: "Digicam", w: QW, h: QH, bg: "#0C0C0D", cut: "#000000",
  blurb: "A 2000s compact: 4:3 frame, orange date burnt into the corner.",
  slots: [{ x: 45, y: 300, w: 990, h: 742 }],
  fields: [f("caption", "Caption", "", 40)],
  under: [],
  over: [
    { k: "text", x: 70, y: 180, t: "{caption}", size: 38, color: "rgba(255,255,255,.92)", font: "sans", weight: "600", wrap: 940 },
    { k: "text", x: QW - 70, y: 1004, t: "{date}", size: 40, color: "#F2941F", font: "mono", align: "right", track: 2 },
    { k: "text", x: 70, y: 1136, t: "FINE  ·  {index2}/{total2}", size: 26, color: "rgba(255,255,255,.4)", font: "mono", track: 4 },
    { k: "grain", amount: 0.09, seed: 29 },
  ],
};

const camcorder: Layout = {
  ...base,
  id: "ca-camcorder", name: "Camcorder", w: QW, h: QH, bg: "#09090A", cut: "#000000",
  blurb: "Tape: a REC dot, a running timecode and a battery in the corner.",
  slots: [{ x: 45, y: 300, w: 990, h: 742 }],
  fields: [f("caption", "Caption", "", 36)],
  under: [],
  over: [
    { k: "rect", x: 70, y: 334, w: 26, h: 26, r: 13, fill: "#E2362F" },
    { k: "text", x: 112, y: 358, t: "REC", size: 30, color: "#FFFFFF", font: "mono", track: 4 },
    { k: "text", x: QW - 70, y: 358, t: "0:00:{index2}", size: 30, color: "#FFFFFF", font: "mono", align: "right", track: 2 },
    { k: "rect", x: QW - 128, y: 962, w: 54, h: 26, r: 4, stroke: "rgba(255,255,255,.8)", lw: 3 },
    { k: "rect", x: QW - 124, y: 966, w: 32, h: 18, r: 2, fill: "rgba(255,255,255,.8)" },
    { k: "text", x: 70, y: 986, t: "SP  ·  {date}", size: 28, color: "rgba(255,255,255,.85)", font: "mono", track: 3 },
    { k: "text", x: 70, y: 1136, t: "{caption}", size: 36, color: "rgba(255,255,255,.9)", font: "mono", wrap: 940 },
    { k: "grain", amount: 0.12, seed: 33 },
    { k: "vignette", strength: 0.3 },
  ],
};

// ---------------------------------------------------------------- layout-led

const magazineCover: Layout = {
  ...base,
  id: "ca-cover", name: "Magazine Cover", w: QW, h: QH, bg: "#111111", cut: "#000000",
  blurb: "A masthead across the top, cover lines down the side, photo behind it all.",
  slots: [{ x: 0, y: 0, w: QW, h: QH }],
  fields: [f("title", "Masthead", "PIXI", 14), f("caption", "Cover line", "", 44)],
  under: [],
  over: [
    { k: "wash", color: "#000000", alpha: 0.2, mode: "multiply" },
    { k: "text", x: QW / 2, y: 190, t: "{title}", size: 150, color: "#FFFFFF", font: "serif", weight: "700", align: "center", track: 6 },
    { k: "line", x1: 72, y1: 232, x2: QW - 72, y2: 232, color: "rgba(255,255,255,.65)", lw: 2 },
    { k: "text", x: 72, y: 286, t: "ISSUE {index2}  ·  {date}", size: 24, color: "rgba(255,255,255,.75)", font: "mono", track: 5 },
    { k: "rect", x: 0, y: 1080, w: QW, h: 270, fill: "rgba(0,0,0,.55)" },
    { k: "text", x: 72, y: 1180, t: "{caption}", size: 48, color: "#FFFFFF", font: "sans", weight: "700", wrap: 936, lh: 58 },
    { k: "text", x: 72, y: 1294, t: "{index} of {total}", size: 24, color: "rgba(255,255,255,.55)", font: "mono", track: 4 },
    { k: "grain", amount: 0.06, seed: 13 },
  ],
};

const collageGrid: Layout = {
  ...base,
  id: "ca-grid4", name: "Collage Grid", w: QW, h: QH, bg: "#121214", cut: "#000000",
  blurb: "Four photos a page in a tight grid, with thin gaps between them.",
  slots: [
    { x: 60, y: 160, w: 470, h: 470, r: 12 },
    { x: 550, y: 160, w: 470, h: 470, r: 12 },
    { x: 60, y: 650, w: 470, h: 470, r: 12 },
    { x: 550, y: 650, w: 470, h: 470, r: 12 },
  ],
  fields: [f("caption", "Caption", "", 40)],
  under: [],
  over: [
    { k: "text", x: 60, y: 118, t: "{caption}", size: 38, color: "rgba(255,255,255,.9)", font: "sans", weight: "600", wrap: 960 },
    { k: "text", x: QW / 2, y: 1220, t: "{index} / {total}", size: 26, color: "rgba(255,255,255,.4)", font: "mono", align: "center", track: 4 },
    { k: "grain", amount: 0.05, seed: 19 },
  ],
};

const split: Layout = {
  ...base,
  id: "ca-split", name: "Split", w: QW, h: QH, bg: "#1C3A34", cut: "#000000",
  blurb: "Half photo, half colour, with the words in the quiet half.",
  slots: [{ x: 0, y: 0, w: QW, h: 760 }],
  fields: [f("title", "Heading", "", 26), f("caption", "Body", "", 110)],
  under: [],
  over: [
    { k: "text", x: 72, y: 880, t: "{title}", size: 62, color: "#F3EFE4", font: "sans", weight: "700", wrap: 936, lh: 72 },
    { k: "line", x1: 72, y1: 930, x2: 260, y2: 930, color: "#C8A96A", lw: 5 },
    { k: "text", x: 72, y: 1000, t: "{caption}", size: 34, color: "rgba(243,239,228,.78)", font: "sans", wrap: 936, lh: 46 },
    { k: "text", x: 72, y: 1292, t: "{index2} / {total2}", size: 24, color: "rgba(243,239,228,.45)", font: "mono", track: 4 },
  ],
};

const tutorialSteps: Layout = {
  ...base,
  id: "ca-steps", name: "Tutorial Steps", w: QW, h: QH, bg: "#13131A", cut: "#000000",
  blurb: "A numbered step a page: big number, photo, one line of instruction.",
  slots: [{ x: 72, y: 330, w: 936, h: 700, r: 24 }],
  fields: [f("title", "Step title", "", 30), f("caption", "What to do", "", 90)],
  under: [],
  over: [
    { k: "rect", x: 72, y: 120, w: 110, h: 110, r: 55, fill: "#F2C84B" },
    { k: "text", x: 127, y: 196, t: "{index}", size: 62, color: "#13131A", font: "sans", weight: "800", align: "center" },
    { k: "text", x: 212, y: 180, t: "{title}", size: 46, color: "#FFFFFF", font: "sans", weight: "700", wrap: 796 },
    { k: "text", x: 212, y: 232, t: "Step {index} of {total}", size: 26, color: "rgba(255,255,255,.45)", font: "mono", track: 3 },
    { k: "text", x: 72, y: 1110, t: "{caption}", size: 36, color: "rgba(255,255,255,.82)", font: "sans", wrap: 936, lh: 48 },
    { k: "grain", amount: 0.04, seed: 27 },
  ],
};

const quoteCard: Layout = {
  ...base,
  id: "ca-quote", name: "Quote Card", w: QW, h: QH, bg: "#0E0E10", cut: "#000000",
  blurb: "A big pull quote over a dimmed photo. For the line you want people to screenshot.",
  slots: [{ x: 0, y: 0, w: QW, h: QH }],
  fields: [f("caption", "Quote", "", 120), f("title", "Who said it", "", 30)],
  under: [],
  over: [
    { k: "wash", color: "#000000", alpha: 0.52, mode: "multiply" },
    { k: "text", x: 90, y: 400, t: "“", size: 190, color: "rgba(255,255,255,.3)", font: "serif" },
    { k: "text", x: 90, y: 560, t: "{caption}", size: 62, color: "#FFFFFF", font: "serif", italic: true, wrap: 900, lh: 80 },
    { k: "line", x1: 90, y1: 1130, x2: 240, y2: 1130, color: "rgba(255,255,255,.5)", lw: 3 },
    { k: "text", x: 90, y: 1192, t: "{title}", size: 32, color: "rgba(255,255,255,.75)", font: "sans", weight: "600", track: 2 },
    { k: "text", x: QW - 90, y: 1192, t: "{index} / {total}", size: 26, color: "rgba(255,255,255,.45)", font: "mono", align: "right", track: 3 },
    { k: "grain", amount: 0.05, seed: 37 },
  ],
};

const beforeAfter: Layout = {
  ...base,
  id: "ca-beforeafter", name: "Before / After", w: QW, h: QH, bg: "#0F0F11", cut: "#000000",
  blurb: "Two photos with a hard line between them, labelled so nobody has to guess.",
  slots: [
    { x: 40, y: 230, w: 496, h: 880 },
    { x: 544, y: 230, w: 496, h: 880 },
  ],
  fields: [f("title", "Left label", "BEFORE", 16), f("caption", "Right label", "AFTER", 16)],
  under: [],
  over: [
    { k: "line", x1: QW / 2, y1: 230, x2: QW / 2, y2: 1110, color: "#FFFFFF", lw: 5 },
    { k: "text", x: 40, y: 190, t: "{title}", size: 36, color: "rgba(255,255,255,.7)", font: "mono", caps: true, track: 6 },
    { k: "text", x: QW - 40, y: 190, t: "{caption}", size: 36, color: "#FFFFFF", font: "mono", caps: true, track: 6, align: "right" },
    { k: "text", x: QW / 2, y: 1200, t: "{index} / {total}", size: 26, color: "rgba(255,255,255,.4)", font: "mono", align: "center", track: 4 },
    { k: "grain", amount: 0.05, seed: 41 },
  ],
};

const contactSheet: Layout = {
  ...base,
  id: "ca-contact6", name: "Contact Sheet", w: QW, h: QH, bg: "#1A1A1C", cut: "#000000",
  blurb: "Six small frames a page, numbered, the way a photographer marks up a sheet.",
  slots: [
    { x: 72, y: 230, w: 300, h: 300 }, { x: 390, y: 230, w: 300, h: 300 }, { x: 708, y: 230, w: 300, h: 300 },
    { x: 72, y: 560, w: 300, h: 300 }, { x: 390, y: 560, w: 300, h: 300 }, { x: 708, y: 560, w: 300, h: 300 },
  ],
  fields: [f("title", "Roll name", "", 26)],
  under: [],
  over: [
    { k: "text", x: 72, y: 150, t: "{title}", size: 42, color: "#EDE8DC", font: "mono", caps: true, track: 4 },
    { k: "text", x: QW - 72, y: 150, t: "SHEET {index2}", size: 28, color: "rgba(237,232,220,.5)", font: "mono", align: "right", track: 4 },
    { k: "line", x1: 72, y1: 182, x2: QW - 72, y2: 182, color: "rgba(237,232,220,.3)", lw: 2 },
    { k: "text", x: 72, y: 950, t: "{date}", size: 26, color: "rgba(237,232,220,.45)", font: "mono", track: 3 },
    { k: "text", x: 72, y: 1010, t: "ISO 400  ·  36 EXP", size: 26, color: "rgba(237,232,220,.35)", font: "mono", track: 3 },
    { k: "grain", amount: 0.08, seed: 43 },
  ],
};

// ---------------------------------------------------------------- colour-led

const pastel: Layout = {
  ...base,
  id: "ca-pastel", name: "Pastel", w: QW, h: QH, bg: "#F6E6E8", cut: "#ffffff",
  blurb: "Soft colour blocks and a rounded photo. Quiet, friendly, easy to read.",
  slots: [{ x: 110, y: 240, w: 860, h: 780, r: 48 }],
  fields: [f("title", "Heading", "", 26), f("caption", "Line", "", 60)],
  under: [{ k: "rect", x: 0, y: 0, w: QW, h: 440, fill: "#EBD5E4" }],
  over: [
    { k: "text", x: 110, y: 170, t: "{title}", size: 56, color: "#4A3B46", font: "sans", weight: "700", wrap: 860 },
    { k: "text", x: 110, y: 1110, t: "{caption}", size: 36, color: "#6B5A64", font: "sans", wrap: 860, lh: 48 },
    { k: "rect", x: 110, y: 1250, w: 120, h: 10, r: 5, fill: "#C98AA8" },
    { k: "text", x: QW - 110, y: 1262, t: "{index} / {total}", size: 26, color: "#9C8793", font: "mono", align: "right", track: 3 },
  ],
};

const grainBW: Layout = {
  ...base,
  id: "ca-grainbw", name: "Grain B&W", w: QW, h: QH, bg: "#0A0A0A", cut: "#000000",
  blurb: "Heavy grain, a thin white rule and nothing else in the way.",
  slots: [{ x: 80, y: 180, w: 920, h: 920 }],
  fields: [f("caption", "Caption", "", 50)],
  under: [],
  over: [
    // Black and white in name and in fact: a grey wash in "saturation" mode drains the colour out
    // of the photo. It goes first, so the text drawn after it keeps its own colour.
    { k: "wash", color: "#808080", alpha: 1, mode: "saturation" },
    { k: "rect", x: 80, y: 180, w: 920, h: 920, stroke: "rgba(255,255,255,.9)", lw: 2 },
    { k: "text", x: 80, y: 1180, t: "{caption}", size: 36, color: "rgba(255,255,255,.85)", font: "mono", wrap: 920, lh: 46 },
    { k: "line", x1: 80, y1: 1248, x2: QW - 80, y2: 1248, color: "rgba(255,255,255,.3)", lw: 1 },
    { k: "text", x: 80, y: 1300, t: "{index2} / {total2}", size: 26, color: "rgba(255,255,255,.5)", font: "mono", track: 5 },
    { k: "grain", amount: 0.26, seed: 47, cell: 2 },
    { k: "vignette", strength: 0.35 },
  ],
};

const sunset: Layout = {
  ...base,
  id: "ca-sunset", name: "Sunset", w: QW, h: QH, bg: "#2A1033", cut: "#000000",
  blurb: "A warm gradient border that glows around the photo.",
  slots: [{ x: 90, y: 250, w: 900, h: 900, r: 28 }],
  fields: [f("caption", "Caption", "", 50)],
  under: [
    { k: "rect", x: 0, y: 0, w: QW, h: QH, fill: { grad: "v", stops: [[0, "#FF8A3D"], [0.55, "#C4418A"], [1, "#4B1E6B"]] } },
    { k: "rect", x: 60, y: 220, w: 960, h: 960, r: 44, fill: "rgba(18,8,24,.55)" },
  ],
  over: [
    { k: "text", x: QW / 2, y: 180, t: "{caption}", size: 44, color: "#FFFFFF", font: "sans", weight: "700", align: "center", wrap: 900 },
    { k: "pill", x: QW / 2, y: 1270, t: "{index} / {total}", size: 26, fg: "#2A1033", bg: "rgba(255,255,255,.85)", align: "center" },
    { k: "grain", amount: 0.06, seed: 53 },
  ],
};

const minimalCaption: Layout = {
  ...base,
  id: "ca-minimal", name: "Minimal", w: QW, h: QH, bg: "#FAFAF8", cut: "#ffffff",
  blurb: "Photo, one quiet line below it, nothing else. Lets the picture do the work.",
  slots: [{ x: 90, y: 90, w: 900, h: 1080 }],
  fields: [f("caption", "Caption", "", 60)],
  under: [],
  over: [
    { k: "text", x: 90, y: 1240, t: "{caption}", size: 34, color: "#26241F", font: "sans", wrap: 760 },
    { k: "text", x: QW - 90, y: 1240, t: "{index2}", size: 34, color: "#A8A49A", font: "mono", align: "right", track: 2 },
  ],
};

// ---------------------------------------------------------------- other shapes

const square: Layout = {
  ...base,
  id: "ca-square", name: "Square", w: SW, h: SH, bg: "#0E0E10", cut: "#000000",
  blurb: "A 1080×1080 post. Fits more on the screen in a feed than a tall one.",
  slots: [{ x: 60, y: 60, w: 960, h: 820, r: 20 }],
  fields: [f("caption", "Caption", "", 44)],
  under: [],
  over: [
    { k: "text", x: 60, y: 960, t: "{caption}", size: 38, color: "rgba(255,255,255,.9)", font: "sans", weight: "600", wrap: 800 },
    { k: "text", x: SW - 60, y: 960, t: "{index} / {total}", size: 28, color: "rgba(255,255,255,.45)", font: "mono", align: "right", track: 3 },
    { k: "grain", amount: 0.05, seed: 59 },
  ],
};

const storyFrame: Layout = {
  ...base,
  id: "ca-story", name: "Story", w: TW, h: TH, bg: "#0B0B0D", cut: "#000000",
  blurb: "A 1080×1920 story, with the progress dots drawn at the top.",
  slots: [{ x: 0, y: 300, w: TW, h: 1320 }],
  fields: [f("caption", "Caption", "", 60)],
  under: [],
  over: [
    { k: "rect", x: 60, y: 90, w: 960, h: 8, r: 4, fill: "rgba(255,255,255,.28)" },
    { k: "rect", x: 60, y: 90, w: 300, h: 8, r: 4, fill: "#FFFFFF" },
    { k: "text", x: 60, y: 210, t: "{caption}", size: 50, color: "#FFFFFF", font: "sans", weight: "700", wrap: 960, lh: 60 },
    { k: "text", x: 60, y: 1760, t: "{index} of {total}", size: 30, color: "rgba(255,255,255,.5)", font: "mono", track: 4 },
    { k: "text", x: TW - 60, y: 1760, t: "{date}", size: 30, color: "rgba(255,255,255,.5)", font: "mono", align: "right", track: 3 },
    { k: "grain", amount: 0.05, seed: 61 },
  ],
};

/** The twenty-two added here, in the order they appear under More frames. */
export const CAROUSEL_STYLES: Layout[] = [
  panorama, filmRoll, polaroidStack, digicam, camcorder, magazineCover,
  collageGrid, split, tutorialSteps, quoteCard, beforeAfter, travelPostcard,
  ticketStub, contactSheet, zine, pastel, grainBW, sunset, newsprint,
  stickerSheet, square, storyFrame, minimalCaption,
];
