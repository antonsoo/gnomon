import "./style.css";

import { CITIES } from "./lib/cities.ts";
import { buildAnalemmaticDial } from "./lib/dials/analemmatic.ts";
import type { HourLineOptions } from "./lib/dials/common.ts";
import { buildEquatorialDial } from "./lib/dials/equatorial.ts";
import { buildHorizontalDial } from "./lib/dials/horizontal.ts";
import { buildDialPlane } from "./lib/dials/plane.ts";
import type { AnalemmaticDialResult, PolarDialResult } from "./lib/dials/types.ts";
import { buildVerticalDial } from "./lib/dials/vertical.ts";
import { equationOfTimeTable } from "./lib/equation-of-time.ts";
import { svgToPngBlob } from "./lib/export/png.ts";
import { MOTTOES } from "./lib/motto.ts";
import type { PlateShape } from "./lib/render/plate-shape.ts";
import { renderAnalemmaticSVG, renderGnomonSVG, renderPolarDialSVG } from "./lib/render/svg.ts";
import type { Theme } from "./lib/render/theme.ts";
import { simulatePolarShadow } from "./lib/simulation.ts";
import type { TimeReference } from "./lib/time-reference.ts";
import { resolveZone } from "./lib/timezone.ts";
import { clear, downloadBlob, el } from "./ui/dom.ts";
import type { AppState, DialType, HistoricalSystem } from "./state.ts";
import { defaultState } from "./state.ts";

const state: AppState = defaultState();

const app = document.getElementById("app")!;

const HOUR_LINE_OPTIONS: HourLineOptions = { startHour: 3, endHour: 21, stepHours: 0.25 };
const DIAL_LABELS: Record<DialType, string> = {
  horizontal: "Horizontal",
  vertical: "Vertical",
  equatorial: "Equatorial",
  analemmatic: "Analemmatic",
};
const THEME_LABELS: Record<Theme, string> = { brass: "Brass", slate: "Slate", blueprint: "Blueprint", laser: "Laser cut" };

// --- derived helpers -------------------------------------------------

/** "37.77° N, 122.42° W" -- real degree signs and compass letters, not signed decimals. */
function formatLatLon(latitudeDeg: number, longitudeDeg: number): string {
  const latLabel = `${Math.abs(latitudeDeg).toFixed(2)}° ${latitudeDeg >= 0 ? "N" : "S"}`;
  const lonLabel = `${Math.abs(longitudeDeg).toFixed(2)}° ${longitudeDeg >= 0 ? "E" : "W"}`;
  return `${latLabel}, ${lonLabel}`;
}

function timeReference(): TimeReference {
  if (state.timeMode === "apparent") return { mode: "apparent", longitudeDeg: state.longitudeDeg };
  const zone = resolveZone(state.timeZone, new Date());
  const dstOffsetHours = state.dstOffsetOverride ?? zone.dstOffsetHours;
  return {
    mode: "standard",
    longitudeDeg: state.longitudeDeg,
    zoneMeridianDeg: zone.zoneMeridianDeg,
    dstOffsetHours,
  };
}

function buildCurrentDial(): PolarDialResult | AnalemmaticDialResult {
  if (state.dialType === "analemmatic") {
    return buildAnalemmaticDial({
      latitudeDeg: state.latitudeDeg,
      semiMajorMm: state.radiusMm,
      startHour: 4,
      endHour: 20,
      stepHours: 1,
      includeZodiac: state.showZodiac,
    });
  }
  const shared = {
    latitudeDeg: state.latitudeDeg,
    timeReference: timeReference(),
    hourLineOptions: HOUR_LINE_OPTIONS,
    nodusDistanceMm: state.radiusMm * 0.32,
    gnomonBaseLengthMm: state.radiusMm * 0.62,
    includeZodiac: state.showZodiac,
    historicalHours: state.historicalHours,
  };
  if (state.dialType === "horizontal") return buildHorizontalDial(shared);
  if (state.dialType === "equatorial") return buildEquatorialDial(shared);
  return buildVerticalDial({ ...shared, wallDeclinationDeg: state.wallDeclinationDeg });
}

function currentInstant(): Date {
  if (state.simMode === "now") return new Date();
  const d = new Date(state.customDateTimeLocal);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// --- DOM: static shell -------------------------------------------------

const svgStageWrap = el("div", { className: "stage-canvas" });
const readout = el("div", { className: "readout" });
const orientationText = el("p", { className: "orientation-text" });
const mottoBox = el("div", { className: "motto" });
const gnomonThumb = el("div", { className: "gnomon-thumb" });
const eotTableWrap = el("div");
const timeSlider = el("input", { type: "range", min: "0", max: "1439", value: "720" }) as HTMLInputElement;
const timeReadout = el("span", { className: "hint" });
const dateInput = el("input", { type: "date" }) as HTMLInputElement;

function fieldRow(label: string, ...controls: HTMLElement[]): HTMLElement {
  const wrap = el("div", { className: "field" }, [el("label", {}, [label])]);
  controls.forEach((c) => wrap.append(c));
  return wrap;
}

function segmented<T extends string>(options: { value: T; label: string }[], current: T, onChange: (v: T) => void): HTMLElement {
  const wrap = el("div", { className: "segmented" });
  const buttons = options.map((opt) => {
    const btn = el(
      "button",
      { type: "button", attrs: { "aria-pressed": String(opt.value === current) } },
      [opt.label],
    );
    btn.addEventListener("click", () => {
      onChange(opt.value);
      wrap.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(options[i]!.value === opt.value)));
      render();
    });
    return btn;
  });
  buttons.forEach((b) => wrap.append(b));
  return wrap;
}

// --- Sidebar: location ---------------------------------------------------

const citySelect = el("select", {}, [
  el("option", { value: "" }, ["Choose a city..."]),
  ...CITIES.map((c) => el("option", { value: c.name }, [`${c.name}, ${c.country}`])),
]) as HTMLSelectElement;
const latInput = el("input", { type: "number", value: String(state.latitudeDeg), attrs: { step: "0.0001" } }) as HTMLInputElement;
const lonInput = el("input", { type: "number", value: String(state.longitudeDeg), attrs: { step: "0.0001" } }) as HTMLInputElement;
const tzInput = el("input", { type: "text", value: state.timeZone }) as HTMLInputElement;
const geoBtn = el("button", { type: "button", className: "ghost" }, ["Use my location"]);
const cityNote = el("p", { className: "hint" });

citySelect.addEventListener("change", () => {
  const c = CITIES.find((x) => x.name === citySelect.value);
  if (!c) return;
  state.latitudeDeg = c.latitudeDeg;
  state.longitudeDeg = c.longitudeDeg;
  state.timeZone = c.timeZone;
  latInput.value = String(c.latitudeDeg);
  lonInput.value = String(c.longitudeDeg);
  tzInput.value = c.timeZone;
  cityNote.textContent = c.note ?? "";
  render();
});
latInput.addEventListener("input", () => {
  const v = Number(latInput.value);
  if (Number.isFinite(v) && v >= -90 && v <= 90) {
    state.latitudeDeg = v;
    render();
  }
});
lonInput.addEventListener("input", () => {
  const v = Number(lonInput.value);
  if (Number.isFinite(v) && v >= -180 && v <= 180) {
    state.longitudeDeg = v;
    render();
  }
});
tzInput.addEventListener("change", () => {
  state.timeZone = tzInput.value.trim() || "UTC";
  render();
});
geoBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    cityNote.textContent = "Geolocation is not available in this browser.";
    return;
  }
  geoBtn.textContent = "Locating...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.latitudeDeg = Math.round(pos.coords.latitude * 10000) / 10000;
      state.longitudeDeg = Math.round(pos.coords.longitude * 10000) / 10000;
      state.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || state.timeZone;
      latInput.value = String(state.latitudeDeg);
      lonInput.value = String(state.longitudeDeg);
      tzInput.value = state.timeZone;
      geoBtn.textContent = "Use my location";
      cityNote.textContent = "";
      render();
    },
    () => {
      geoBtn.textContent = "Use my location";
      cityNote.textContent = "Location request denied or unavailable.";
    },
  );
});

const locationPanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Location"]),
  fieldRow("City", citySelect),
  el("div", { className: "field-row" }, [fieldRow("Latitude", latInput), fieldRow("Longitude", lonInput)]),
  fieldRow("Time zone (IANA)", tzInput),
  geoBtn,
  cityNote,
]);

// --- Sidebar: dial type ---------------------------------------------------

const wallDeclinationField = fieldRow(
  "Wall declination from south (°)",
  el("input", { type: "number", value: String(state.wallDeclinationDeg), attrs: { step: "1" } }) as HTMLInputElement,
);
(wallDeclinationField.querySelector("input") as HTMLInputElement).addEventListener("input", (e) => {
  state.wallDeclinationDeg = Number((e.target as HTMLInputElement).value) || 0;
  render();
});
const wallHint = el("p", { className: "hint" }, [
  "0\u00B0 = direct south. Positive declines west; negative declines east. The formula handles either hemisphere.",
]);

const dialTypePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Dial type"]),
  segmented(
    (Object.keys(DIAL_LABELS) as DialType[]).map((v) => ({ value: v, label: DIAL_LABELS[v] })),
    state.dialType,
    (v) => {
      state.dialType = v;
      wallDeclinationField.style.display = v === "vertical" ? "" : "none";
      wallHint.style.display = v === "vertical" ? "" : "none";
      plateShapeField.style.display = v === "analemmatic" ? "none" : "";
      radiusField.querySelector("label")!.textContent = v === "analemmatic" ? "Semi-major axis (mm)" : "Dial radius (mm)";
    },
  ),
  wallDeclinationField,
  wallHint,
]);
wallDeclinationField.style.display = "none";
wallHint.style.display = "none";

// --- Sidebar: time reference ---------------------------------------------

const dstCheckbox = el("input", { type: "checkbox" }) as HTMLInputElement;
const dstRow = el("label", { className: "checkbox-row" }, [dstCheckbox, "Daylight saving in effect"]);
dstCheckbox.addEventListener("change", () => {
  state.dstOffsetOverride = dstCheckbox.checked ? 1 : 0;
  render();
});
const autoDstBtn = el("button", { type: "button", className: "ghost" }, ["Auto-detect from time zone"]);
autoDstBtn.addEventListener("click", () => {
  state.dstOffsetOverride = null;
  const zone = resolveZone(state.timeZone, currentInstant());
  dstCheckbox.checked = zone.dstOffsetHours > 0;
  render();
});

const timeModePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Time shown"]),
  segmented(
    [
      { value: "standard" as const, label: "Standard/zone time" },
      { value: "apparent" as const, label: "Local apparent time" },
    ],
    state.timeMode,
    (v) => {
      state.timeMode = v;
      dstRow.style.display = v === "standard" ? "" : "none";
      autoDstBtn.style.display = v === "standard" ? "" : "none";
    },
  ),
  dstRow,
  autoDstBtn,
  el("p", { className: "hint" }, [
    "Standard time bakes in the fixed longitude correction from your zone's reference meridian. Apparent time reads the sun directly — no correction table needed, but it won't match a clock.",
  ]),
]);

// --- Sidebar: overlays -----------------------------------------------------

const numeralsRow = segmented(
  [
    { value: "roman" as const, label: "Roman" },
    { value: "arabic" as const, label: "Arabic" },
  ],
  state.numerals,
  (v) => {
    state.numerals = v;
  },
);

function overlayCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", checked }) as HTMLInputElement;
  input.addEventListener("change", () => {
    onChange(input.checked);
    render();
  });
  return el("label", { className: "checkbox-row" }, [input, label]);
}

const historicalWrap = el("div", {}, [
  overlayCheckbox("Temporal (Roman unequal) hours", false, (v) => toggleHistorical("temporal", v)),
  overlayCheckbox("Babylonian hours (from sunrise)", false, (v) => toggleHistorical("babylonian", v)),
  overlayCheckbox("Italian hours (from sunset)", false, (v) => toggleHistorical("italian", v)),
]);
function toggleHistorical(system: HistoricalSystem, on: boolean) {
  state.historicalHours = on ? [...state.historicalHours, system] : state.historicalHours.filter((s) => s !== system);
}

const overlaysPanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Hours & overlays"]),
  fieldRow("Numerals", numeralsRow),
  overlayCheckbox("Declination (date) lines", state.showDeclinationLines, (v) => (state.showDeclinationLines = v)),
  overlayCheckbox("Zodiac entries", state.showZodiac, (v) => (state.showZodiac = v)),
  el("p", { className: "hint" }, ["Historical hour systems (curves, computed day by day):"]),
  historicalWrap,
]);

// --- Sidebar: size + theme + motto ----------------------------------------

const radiusInput = el("input", { type: "number", value: String(state.radiusMm), attrs: { step: "5", min: "30", max: "400" } }) as HTMLInputElement;
radiusInput.addEventListener("input", () => {
  const v = Number(radiusInput.value);
  if (Number.isFinite(v) && v >= 20) {
    state.radiusMm = v;
    render();
  }
});

const themeRow = segmented(
  (Object.keys(THEME_LABELS) as Theme[]).map((v) => ({ value: v, label: THEME_LABELS[v] })),
  state.theme,
  (v) => {
    state.theme = v;
  },
);

const PLATE_SHAPE_LABELS: Record<PlateShape, string> = { fan: "Fan (classic, no wasted plate)", circle: "Full circle" };
const plateShapeRow = segmented(
  (Object.keys(PLATE_SHAPE_LABELS) as PlateShape[]).map((v) => ({ value: v, label: PLATE_SHAPE_LABELS[v] })),
  state.plateShape,
  (v) => {
    state.plateShape = v;
  },
);
const plateShapeField = fieldRow("Plate shape", plateShapeRow);

const mottoSelect = el("select", {}, [
  el("option", { value: "-1" }, ["No motto"]),
  ...MOTTOES.map((m, i) => el("option", { value: String(i) }, [m.latin])),
]) as HTMLSelectElement;
mottoSelect.value = String(state.mottoIndex ?? -1);
mottoSelect.addEventListener("change", () => {
  const v = Number(mottoSelect.value);
  state.mottoIndex = v >= 0 ? v : null;
  render();
});

const radiusField = fieldRow(state.dialType === "analemmatic" ? "Semi-major axis (mm)" : "Dial radius (mm)", radiusInput);

const appearancePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Size & appearance"]),
  radiusField,
  plateShapeField,
  fieldRow("Theme", themeRow),
  fieldRow("Motto", mottoSelect),
]);

const sidebar = el("aside", {}, [locationPanel, dialTypePanel, timeModePanel, overlaysPanel, appearancePanel]);

// --- Stage -----------------------------------------------------------------

const nowBtn = el("button", { type: "button", attrs: { "aria-pressed": "true" } }, ["Now"]);
const playBtn = el("button", { type: "button", className: "ghost" }, ["▶ Animate day"]);
nowBtn.addEventListener("click", () => {
  state.simMode = "now";
  state.playing = false;
  playBtn.textContent = "▶ Animate day";
  nowBtn.setAttribute("aria-pressed", "true");
  render();
});
dateInput.addEventListener("change", () => {
  state.simMode = "custom";
  nowBtn.setAttribute("aria-pressed", "false");
  syncCustomDateTime();
  render();
});
timeSlider.addEventListener("input", () => {
  state.simMode = "custom";
  nowBtn.setAttribute("aria-pressed", "false");
  syncCustomDateTime();
  render();
});
playBtn.addEventListener("click", () => {
  state.playing = !state.playing;
  state.simMode = "custom";
  nowBtn.setAttribute("aria-pressed", "false");
  playBtn.textContent = state.playing ? "❚❚ Pause" : "▶ Animate day";
  render();
});

function syncCustomDateTime() {
  const minutes = Number(timeSlider.value);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const datePart = dateInput.value || currentInstant().toISOString().slice(0, 10);
  state.customDateTimeLocal = `${datePart}T${hh}:${mm}`;
}

const exportSvgBtn = el("button", { type: "button", className: "primary" }, ["Download SVG"]);
const exportPdfA4Btn = el("button", { type: "button" }, ["PDF (A4)"]);
const exportPdfLetterBtn = el("button", { type: "button" }, ["PDF (Letter)"]);
const exportPngBtn = el("button", { type: "button" }, ["PNG"]);
const exportGnomonBtn = el("button", { type: "button", className: "ghost" }, ["Gnomon SVG"]);

const stage = el("section", { className: "stage" }, [
  el("div", { className: "stage-toolbar" }, [
    el("div", { className: "time-controls" }, [
      nowBtn,
      playBtn,
      dateInput,
      el("div", { className: "slider-wrap" }, [timeSlider]),
      timeReadout,
    ]),
  ]),
  svgStageWrap,
  readout,
]);

// --- Details rail ------------------------------------------------------

const exportPanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Export"]),
  el("div", { className: "export-grid" }, [exportSvgBtn, exportPngBtn, exportPdfA4Btn, exportPdfLetterBtn]),
  exportGnomonBtn,
  el("p", { className: "hint" }, [
    "Laser SVG uses red strokes for cuts (outer edge, gnomon outline) and black for engraving (hour lines, numerals) — the common convention for hobby laser software.",
  ]),
]);

const orientationPanel = el("section", { className: "panel" }, [el("h2", {}, ["Mounting"]), orientationText]);
const gnomonPanel = el("section", { className: "panel" }, [el("h2", {}, ["Gnomon template"]), gnomonThumb]);
const mottoPanel = el("section", { className: "panel" }, [el("h2", {}, ["Motto"]), mottoBox]);
const eotPanel = el("section", { className: "panel" }, [el("h2", {}, ["Equation of time (this year)"]), eotTableWrap]);

const detailsRail = el("aside", { className: "details-rail" }, [orientationPanel, gnomonPanel, exportPanel, mottoPanel, eotPanel]);

// --- Header, instructions, footer -----------------------------------------

const header = el("header", { className: "masthead" }, [
  el("h1", { className: "wordmark" }, ["Gnomon", el("small", {}, ["sundial designer"])]),
  el("p", { className: "tagline" }, [
    "Design a sundial that actually works, for any place on Earth. Print it, laser-cut it, set it in the sun.",
  ]),
]);

const instructionsSection = el("section", { className: "section", attrs: { id: "instructions" } }, [
  el("h2", {}, ["Setting it up"]),
  el("div", { className: "instructions-grid" }, [
    el("div", { className: "panel" }, [
      el("h3", {}, ["1. Find true north"]),
      el("p", {}, [
        "A compass points at magnetic north, not true north — the difference (magnetic declination) is several degrees almost everywhere and changes over time. Look up your local declination (e.g. via NOAA's calculator) and correct for it, or find true north from the sun at local solar noon (shortest shadow of the day, from the hour angle this tool computes) or from Polaris at night.",
      ]),
    ]),
    el("div", { className: "panel" }, [
      el("h3", {}, ["2. Level it"]),
      el("p", {}, [
        "Horizontal and analemmatic dials must sit level — a tilted plate throws every hour line off by roughly the tilt angle. Vertical dials must be plumb (true vertical), and their face must be square to the wall declination you designed for.",
      ]),
    ]),
    el("div", { className: "panel" }, [
      el("h3", {}, ["3. Set the gnomon"]),
      el("p", {}, [
        "The style angle shown in the gnomon panel is measured from the dial face, not from vertical. Mount the style so its edge, extended, points at the celestial pole — Polaris, closely enough, in the northern hemisphere. Getting this angle right matters more than getting the placement right: it is what makes the hour lines correct for your latitude.",
      ]),
    ]),
  ]),
]);

const oracleNote = el("section", { className: "section" }, [
  el("h2", {}, ["How this is checked"]),
  el("p", { className: "orientation-text" }, [
    "The hour-line geometry is cross-checked by an independent 3D ray-casting oracle in the test suite: a second implementation, with its own sun-position formula and its own plane/ray intersection, casts the actual shadow in 3D for many latitudes, longitudes, dates and dial types and checks it lands on the hour line the dial labels — plus a direct check against the published closed-form horizontal- and vertical-dial formulas. See ",
    el("a", { href: "https://github.com/antonsoo/gnomon#accuracy-and-limitations" }, ["Accuracy and limitations"]),
    " in the README for what is, and isn't, guaranteed.",
  ]),
]);

const footer = el("footer", { className: "site-footer" }, [
  el("span", {}, ["Gnomon — MIT licensed."]),
  el("a", { href: "https://github.com/antonsoo/gnomon" }, ["Source on GitHub"]),
]);

app.append(
  el("div", { className: "app" }, [
    header,
    el("div", { className: "layout" }, [sidebar, stage, detailsRail]),
    instructionsSection,
    oracleNote,
    footer,
  ]),
);

// --- Render loop -------------------------------------------------------

function render(): void {
  const dial = buildCurrentDial();
  const instant = currentInstant();

  clear(svgStageWrap);
  readout.replaceChildren();

  if (dial.kind === "analemmatic") {
    const svg = renderAnalemmaticSVG(dial, {
      widthMm: dial.semiMajorMm * 2.6,
      heightMm: dial.semiMajorMm * 2.6,
      theme: state.theme,
      numerals: state.numerals,
      title: formatLatLon(state.latitudeDeg, state.longitudeDeg),
      motto: state.mottoIndex !== null ? MOTTOES[state.mottoIndex] : undefined,
    });
    svgStageWrap.innerHTML = svg;
    orientationText.textContent =
      "Lay flat and level, major axis east-west. Stand on today's date mark (on the north-south line) and read the hour where your shadow crosses the ellipse.";
    gnomonThumb.replaceChildren("No fixed gnomon — the dial uses you (or a vertical rod) as the style; its position moves along the date scale.");
  } else {
    const radius = state.radiusMm;
    const shadow = state.simMode === "now" || state.playing || state.simMode === "custom"
      ? simulatePolarShadow(instant, state.latitudeDeg, state.longitudeDeg, buildDialPlane(dial.kind, state.latitudeDeg, state.wallDeclinationDeg), radius * 0.32)
      : null;
    const svg = renderPolarDialSVG(dial, {
      radiusMm: radius,
      innerRadiusMm: Math.max(4, radius * 0.06),
      plateShape: state.plateShape,
      numerals: state.numerals,
      theme: state.theme,
      showDeclinationLines: state.showDeclinationLines,
      showHistoricalHours: state.historicalHours.length > 0,
      title: `${DIAL_LABELS[state.dialType]} · ${formatLatLon(state.latitudeDeg, state.longitudeDeg)}`,
      motto: state.mottoIndex !== null ? MOTTOES[state.mottoIndex] : undefined,
      shadowTip: shadow?.visible ? shadow.tip : null,
    });
    svgStageWrap.innerHTML = svg;
    orientationText.textContent = dial.orientation;

    const thumbSvg = renderGnomonSVG(dial, { theme: state.theme, marginMm: 8 });
    gnomonThumb.replaceChildren();
    gnomonThumb.innerHTML = thumbSvg;

    if (shadow) {
      readout.replaceChildren(
        el("span", {}, [el("strong", {}, ["alt "]), `${shadow.altitudeDeg.toFixed(1)}\u00B0`]),
        el("span", {}, [el("strong", {}, ["az "]), `${shadow.azimuthDeg.toFixed(1)}\u00B0`]),
        el("span", {}, [el("strong", {}, ["hour angle "]), `${shadow.hourAngleDeg.toFixed(1)}\u00B0`]),
        el("span", {}, [el("strong", {}, ["declination "]), `${shadow.declinationDeg.toFixed(2)}\u00B0`]),
        el("span", {}, [el("strong", {}, ["equation of time "]), `${shadow.equationOfTimeMin >= 0 ? "+" : ""}${shadow.equationOfTimeMin.toFixed(1)} min`]),
        el("span", {}, [shadow.visible ? "shadow visible on this face" : "sun not illuminating this face right now"]),
      );
    }
  }

  if (state.mottoIndex !== null) {
    const m = MOTTOES[state.mottoIndex]!;
    mottoBox.replaceChildren(
      el("p", { className: "latin" }, [m.latin]),
      el("p", { className: "translation" }, [`"${m.translation}"`]),
      el("p", { className: "attribution" }, [m.attribution + (m.note ? ` — ${m.note}` : "")]),
    );
  } else {
    mottoBox.replaceChildren(el("p", { className: "hint" }, ["Pick a motto in Size & appearance."]));
  }

  renderEotTable();
  const dt = instant;
  timeReadout.textContent = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function renderEotTable(): void {
  const rows = equationOfTimeTable(new Date().getFullYear(), [1, 15]);
  const table = el("table", { className: "eot-table" }, [
    el("thead", {}, [el("tr", {}, [el("th", {}, ["Date"]), el("th", {}, ["EoT (min)"])])]),
    el(
      "tbody",
      {},
      rows.map((r) => el("tr", {}, [el("td", {}, [r.label]), el("td", {}, [`${r.equationOfTimeMin >= 0 ? "+" : ""}${r.equationOfTimeMin.toFixed(1)}`])])),
    ),
  ]);
  eotTableWrap.replaceChildren(table);
}

// --- Export handlers ---------------------------------------------------

function currentSvgString(theme: Theme): string {
  const dial = buildCurrentDial();
  if (dial.kind === "analemmatic") {
    return renderAnalemmaticSVG(dial, {
      widthMm: dial.semiMajorMm * 2.6,
      heightMm: dial.semiMajorMm * 2.6,
      theme,
      numerals: state.numerals,
    });
  }
  const radius = state.radiusMm;
  return renderPolarDialSVG(dial, {
    radiusMm: radius,
    innerRadiusMm: Math.max(4, radius * 0.06),
    plateShape: state.plateShape,
    numerals: state.numerals,
    theme,
    showDeclinationLines: state.showDeclinationLines,
    showHistoricalHours: state.historicalHours.length > 0,
  });
}

exportSvgBtn.addEventListener("click", () => {
  const svg = currentSvgString("laser");
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `gnomon-${state.dialType}.svg`);
});
exportGnomonBtn.addEventListener("click", () => {
  const dial = buildCurrentDial();
  if (dial.kind === "analemmatic") return;
  const svg = renderGnomonSVG(dial, { theme: "laser", marginMm: 8 });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `gnomon-style-${state.dialType}.svg`);
});
exportPngBtn.addEventListener("click", async () => {
  const svg = currentSvgString(state.theme);
  const mmMatch = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg);
  const wMm = mmMatch ? Number(mmMatch[1]) : 200;
  const hMm = mmMatch ? Number(mmMatch[2]) : 200;
  const pxPerMm = 300 / 25.4; // 300 DPI
  const blob = await svgToPngBlob(svg, Math.round(wMm * pxPerMm), Math.round(hMm * pxPerMm));
  downloadBlob(blob, `gnomon-${state.dialType}.png`);
});
async function exportPdf(format: "a4" | "letter") {
  const dial = buildCurrentDial();
  if (dial.kind === "analemmatic") {
    window.alert("PDF export currently supports the horizontal, vertical and equatorial dials. Use SVG export for the analemmatic layout.");
    return;
  }
  try {
    // jsPDF (and its transitive canvas/purify dependencies) is only
    // needed once someone actually asks for a PDF, so it is loaded as a
    // separate chunk rather than bloating the initial page load.
    const { exportPolarDialPDF } = await import("./lib/export/pdf.ts");
    const bytes = exportPolarDialPDF(dial, {
      radiusMm: state.radiusMm,
      innerRadiusMm: Math.max(4, state.radiusMm * 0.06),
      plateShape: state.plateShape,
      numerals: state.numerals,
      title: `${DIAL_LABELS[state.dialType]} sundial · ${formatLatLon(state.latitudeDeg, state.longitudeDeg)}`,
      format,
    });
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `gnomon-${state.dialType}-${format}.pdf`);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}
exportPdfA4Btn.addEventListener("click", () => exportPdf("a4"));
exportPdfLetterBtn.addEventListener("click", () => exportPdf("letter"));

// --- Animation tick ------------------------------------------------------

setInterval(() => {
  if (state.simMode === "now") {
    render();
  } else if (state.playing) {
    const minutes = (Number(timeSlider.value) + 4) % 1440;
    timeSlider.value = String(minutes);
    syncCustomDateTime();
    render();
  }
}, 1000);

dateInput.value = new Date().toISOString().slice(0, 10);
render();
