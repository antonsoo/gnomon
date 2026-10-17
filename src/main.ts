import "./fonts/fonts.css";
import "./style.css";

import { CITIES } from "./lib/cities.ts";
import { buildDialPlane } from "./lib/dials/plane.ts";
import { captureDesign, designSvg, requireUsableDesign, type DesignSnapshot } from "./design.ts";
import { MAX_DESIGN_FILE_BYTES, openDesignFile, saveDesignFile, type OpenedDesign } from "./design-file.ts";
import { equationOfTimeTable } from "./lib/equation-of-time.ts";
import { locate, LOCATE_FAILURE_TEXT } from "./lib/locate.ts";
import { pngDimensions, svgToPngBlob } from "./lib/export/png.ts";
// Construction export must work when a loaded designer goes offline, including
// its first PDF. Load the vector writer with the app instead of at click time.
import { exportConstructionPDF } from "./lib/export/pdf.ts";
import { planConstructionPrint } from "./lib/export/print-layout.ts";
import { gnomonConstructionWarning } from "./lib/render/gnomon-layout.ts";
import { MOTTOES } from "./lib/motto.ts";
import type { PlateShape } from "./lib/render/plate-shape.ts";
import { renderAnalemmaticSVG, renderGnomonSVG, renderPolarDialSVG } from "./lib/render/svg.ts";
import type { Theme } from "./lib/render/theme.ts";
import { simulatePolarShadow } from "./lib/simulation.ts";
import { formatUtcOffset, isValidTimeZone, offsetMinutesAt, resolveLocalDateTime, zonedDateTimeInput } from "./lib/timezone.ts";
import { clear, downloadBlob, el } from "./ui/dom.ts";
import type { AppState, DialType, HistoricalSystem } from "./state.ts";
import { defaultState } from "./state.ts";

const state: AppState = defaultState();
let editRevision = 0;
const syncControls: (() => void)[] = [];
function renderEdited(): void { editRevision++; render(); }

const app = document.getElementById("app")!;

const DIAL_LABELS: Record<DialType, string> = {
  horizontal: "Horizontal",
  vertical: "Vertical",
  equatorial: "Equatorial",
  analemmatic: "Analemmatic",
};
const THEME_LABELS: Record<Theme, string> = { brass: "Brass", slate: "Slate", blueprint: "Blueprint", laser: "Laser cut" };

// --- derived helpers -------------------------------------------------

function currentInstant(): Date | null {
  if (state.simMode === "now") return new Date();
  const result = resolveLocalDateTime(state.customDateTimeLocal, state.timeZone);
  if (result.kind !== "valid") return null;
  return result.instants[state.timeDisambiguation === "later" ? result.instants.length - 1 : 0]!;
}

// --- DOM: static shell -------------------------------------------------

const svgStageWrap = el("div", { className: "stage-canvas" });
svgStageWrap.tabIndex = 0;
svgStageWrap.setAttribute("role", "group");
svgStageWrap.setAttribute("aria-label", "Scrollable sundial drawing");
let previewZoom = 1;
const zoomOut = el("button", { type: "button", attrs: { "aria-label": "Zoom out preview" } }, ["−"]);
const zoomIn = el("button", { type: "button", attrs: { "aria-label": "Zoom in preview" } }, ["+"]);
const zoomReset = el("button", { type: "button" }, ["Fit preview"]);
const zoomReadout = el("output", { attrs: { "aria-label": "Preview zoom", "aria-live": "polite" } });
function updatePreviewZoom(): void {
  const svg = svgStageWrap.querySelector("svg");
  svgStageWrap.classList.toggle("zoomed", previewZoom > 1);
  if (svg) svg.style.width = previewZoom > 1 ? `${Math.max(1, svgStageWrap.clientWidth - 26) * previewZoom}px` : "";
  const label = `${previewZoom * 100}%`;
  if (zoomReadout.textContent !== label) zoomReadout.textContent = label;
  zoomOut.disabled = zoomReset.disabled = previewZoom <= 1;
  zoomIn.disabled = previewZoom >= 4;
}
zoomOut.addEventListener("click", () => { previewZoom = Math.max(1, previewZoom - 0.5); updatePreviewZoom(); });
zoomIn.addEventListener("click", () => { previewZoom = Math.min(4, previewZoom + 0.5); updatePreviewZoom(); });
zoomReset.addEventListener("click", () => { previewZoom = 1; updatePreviewZoom(); });
window.addEventListener("resize", updatePreviewZoom);
const readout = el("div", { className: "readout" });
const orientationText = el("p", { className: "orientation-text" });
const mottoBox = el("div", { className: "motto" });
const gnomonThumb = el("div", { className: "gnomon-thumb" });
const gnomonNote = el("p", { className: "hint" });
const eotTableWrap = el("div");
const timeSlider = el("input", {
  type: "range",
  min: "0",
  max: "1439",
  value: "720",
  attrs: { "aria-label": "Time of day for the simulated shadow" },
}) as HTMLInputElement;
const timeReadout = el("span", { className: "hint" });
const dateInput = el("input", { type: "date", attrs: { min: "1900-01-01", max: "2100-12-31", "aria-label": "Date for the simulated shadow", "aria-describedby": "simulation-note" } });
const timeInput = el("input", { type: "time", attrs: { "aria-label": "Local time for the simulated shadow", "aria-describedby": "simulation-note", step: "60" } });
const simulationNote = el("p", { className: "hint", id: "simulation-note", attrs: { role: "status" } });
const designStatus = el("p", { className: "hint", attrs: { role: "status" } });
const timeBasisNote = el("p", { className: "hint" });
const foldSelect = el("select", { attrs: { "aria-label": "Repeated local time" } });
foldSelect.hidden = true;
foldSelect.addEventListener("change", () => {
  state.timeDisambiguation = foldSelect.value as "earlier" | "later";
  renderEdited();
});
let currentDesign: DesignSnapshot | null = null;
let exportPending = false;
const invalidFields = new Map<HTMLInputElement, string>();

let fieldIds = 0;

/**
 * A labelled field. The label is tied to its control (`for`, or
 * `aria-labelledby` on a button group) so screen readers announce it and a
 * click on the label focuses the input.
 */
function fieldRow(label: string, ...controls: HTMLElement[]): HTMLElement {
  const labelEl = el("label", {}, [label]);
  const first = controls[0];
  if (first instanceof HTMLInputElement || first instanceof HTMLSelectElement) {
    first.id ||= `field-${++fieldIds}`;
    labelEl.htmlFor = first.id;
  } else if (first) {
    labelEl.id = `field-label-${++fieldIds}`;
    first.setAttribute("role", "group");
    first.setAttribute("aria-labelledby", labelEl.id);
  }
  const wrap = el("div", { className: "field" }, [labelEl]);
  controls.forEach((c) => wrap.append(c));
  return wrap;
}

function bindNumber(input: HTMLInputElement, label: string, min: number, max: number, update: (value: number) => void, location = false): void {
  input.min = String(min);
  input.max = String(max);
  input.step = "any";
  input.required = true;
  const message = el("p", { className: "field-error", id: `field-error-${++fieldIds}` });
  input.setAttribute("aria-describedby", message.id);
  input.after(message);
  input.addEventListener("input", () => {
    if (location) retireLocation();
    const value = input.valueAsNumber;
    const error = !Number.isFinite(value) || value < min || value > max ? `${label}: enter a number from ${min} to ${max}.` : "";
    message.textContent = error;
    input.setAttribute("aria-invalid", String(Boolean(error)));
    if (error) invalidFields.set(input, error);
    else {
      invalidFields.delete(input);
      update(value);
    }
    renderEdited();
  });
}

function clearFieldError(input: HTMLInputElement): void {
  invalidFields.delete(input);
  input.removeAttribute("aria-invalid");
  const message = document.getElementById(input.getAttribute("aria-describedby") ?? "");
  if (message?.classList.contains("field-error")) message.textContent = "";
}

function segmented<T extends string>(
  options: { value: T; label: string }[],
  current: () => T,
  onChange: (v: T) => void,
  groupLabel?: string,
): HTMLElement {
  const wrap = el("div", { className: "segmented" });
  if (groupLabel) {
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", groupLabel);
  }
  const buttons = options.map((opt) => {
    const btn = el(
      "button",
      { type: "button", attrs: { "aria-pressed": String(opt.value === current()) } },
      [opt.label],
    );
    btn.addEventListener("click", () => {
      onChange(opt.value);
      wrap.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(options[i]!.value === opt.value)));
      renderEdited();
    });
    return btn;
  });
  syncControls.push(() => buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(options[i]!.value === current()))));
  buttons.forEach((b) => wrap.append(b));
  return wrap;
}

// --- Sidebar: location ---------------------------------------------------

const citySelect = el("select", {}, [
  el("option", { value: "" }, ["Choose a city..."]),
  ...CITIES.map((c) => el("option", { value: c.name }, [`${c.name}, ${c.country}`])),
]) as HTMLSelectElement;
const latInput = el("input", {
  type: "number",
  value: String(state.latitudeDeg),
  attrs: { step: "0.0001", min: "-90", max: "90" },
}) as HTMLInputElement;
const lonInput = el("input", {
  type: "number",
  value: String(state.longitudeDeg),
  attrs: { step: "0.0001", min: "-180", max: "180" },
}) as HTMLInputElement;
const tzInput = el("input", { type: "text", value: state.timeZone }) as HTMLInputElement;
const geoBtn = el("button", { type: "button", className: "ghost" }, ["Use my location"]);
const cityNote = el("p", { className: "hint", attrs: { role: "status" } });
let cancelLocation = () => {};
function retireLocation(): void {
  cancelLocation();
  geoBtn.textContent = "Use my location";
  geoBtn.disabled = false;
  citySelect.value = "";
  cityNote.textContent = "";
}

citySelect.addEventListener("change", () => {
  const c = CITIES.find((x) => x.name === citySelect.value);
  if (!c) return;
  retireLocation();
  citySelect.value = c.name;
  state.latitudeDeg = c.latitudeDeg;
  state.longitudeDeg = c.longitudeDeg;
  state.timeZone = c.timeZone;
  latInput.value = String(c.latitudeDeg);
  lonInput.value = String(c.longitudeDeg);
  tzInput.value = c.timeZone;
  [latInput, lonInput, tzInput].forEach(clearFieldError);
  cityNote.textContent = c.note ?? "";
  renderEdited();
});
tzInput.addEventListener("input", () => {
  retireLocation();
  const requested = tzInput.value.trim();
  if (!isValidTimeZone(requested)) {
    tzInput.setAttribute("aria-invalid", "true");
    cityNote.textContent = "Enter an IANA time zone such as America/Los_Angeles or Europe/Rome.";
    invalidFields.set(tzInput, cityNote.textContent);
    renderEdited();
    return;
  }
  clearFieldError(tzInput);
  cityNote.textContent = "";
  state.timeZone = requested;
  renderEdited();
});
const GEO_LABEL = "Use my location";
geoBtn.addEventListener("click", () => {
  retireLocation();
  geoBtn.textContent = "Locating...";
  geoBtn.disabled = true;
  const ready = () => {
    geoBtn.textContent = GEO_LABEL;
    geoBtn.disabled = false;
  };
  cancelLocation = locate("geolocation" in navigator ? navigator.geolocation : undefined, {
    position(latitudeDeg, longitudeDeg) {
      state.latitudeDeg = Math.round(latitudeDeg * 10000) / 10000;
      state.longitudeDeg = Math.round(longitudeDeg * 10000) / 10000;
      state.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || state.timeZone;
      latInput.value = String(state.latitudeDeg);
      lonInput.value = String(state.longitudeDeg);
      tzInput.value = state.timeZone;
      [latInput, lonInput, tzInput].forEach(clearFieldError);
      ready();
      cityNote.textContent = "Coordinates found. Time zone uses your device setting; check it if the device zone differs from your location.";
      renderEdited();
    },
    failed(reason) {
      ready();
      cityNote.textContent = LOCATE_FAILURE_TEXT[reason];
    },
  });
});

const locationPanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Location"]),
  fieldRow("City", citySelect),
  el("div", { className: "field-row" }, [fieldRow("Latitude", latInput), fieldRow("Longitude", lonInput)]),
  fieldRow("Time zone (IANA)", tzInput),
  geoBtn,
  cityNote,
]);
cityNote.id = "location-note";
tzInput.setAttribute("aria-describedby", cityNote.id);
bindNumber(latInput, "Latitude", -90, 90, (v) => { state.latitudeDeg = v; }, true);
bindNumber(lonInput, "Longitude", -180, 180, (v) => { state.longitudeDeg = v; }, true);

// --- Sidebar: dial type ---------------------------------------------------

const wallDeclinationField = fieldRow(
  "Wall declination from south (°)",
  el("input", { type: "number", value: String(state.wallDeclinationDeg), attrs: { step: "1" } }) as HTMLInputElement,
);
const wallInput = wallDeclinationField.querySelector("input")!;
bindNumber(wallInput, "Wall declination", -180, 180, (v) => { state.wallDeclinationDeg = v; });
const wallHint = el("p", { className: "hint" }, [
  "0\u00B0 = direct south. Positive declines west; negative declines east. The formula handles either hemisphere.",
]);

const dialTypePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Dial type"]),
  segmented(
    (Object.keys(DIAL_LABELS) as DialType[]).map((v) => ({ value: v, label: DIAL_LABELS[v] })),
    () => state.dialType,
    (v) => {
      state.dialType = v;
      if (v === "analemmatic") { stopPlaying(); state.simMode = "now"; }
      if (v !== "vertical") {
        wallInput.value = String(state.wallDeclinationDeg);
        clearFieldError(wallInput);
      }
    },
    "Dial type",
  ),
  wallDeclinationField,
  wallHint,
]);
wallDeclinationField.style.display = "none";
wallHint.style.display = "none";

// --- Sidebar: time reference ---------------------------------------------

const dstSelect = el("select", {}, [
  el("option", { value: "auto" }, ["Automatic for simulation date"]),
  el("option", { value: "0" }, ["Standard time (+0 hours)"]),
  el("option", { value: "0.5" }, ["Daylight time (+30 minutes)"]),
  el("option", { value: "1" }, ["Daylight time (+1 hour)"]),
  el("option", { value: "2" }, ["Daylight time (+2 hours)"]),
]);
const dstRow = fieldRow("Dial clock adjustment", dstSelect);
dstSelect.addEventListener("change", () => {
  state.dstOffsetOverride = dstSelect.value === "auto" ? null : Number(dstSelect.value);
  renderEdited();
});

const timeModePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Time shown"]),
  el("div", { className: "polar-time-controls" }, [segmented(
    [
      { value: "standard" as const, label: "Standard/zone time" },
      { value: "apparent" as const, label: "Local apparent time" },
    ],
    () => state.timeMode,
    (v) => {
      state.timeMode = v;
    },
    "Time shown",
  ), dstRow]),
  el("p", { className: "hint analemmatic-note" }, ["Analemmatic hour marks use local apparent solar time. Zone-time corrections and historical overlays are not available for this layout."]),
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
  () => state.numerals,
  (v) => {
    state.numerals = v;
  },
);

function overlayCheckbox(label: string, checked: () => boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", checked: checked() }) as HTMLInputElement;
  input.addEventListener("change", () => {
    onChange(input.checked);
    renderEdited();
  });
  syncControls.push(() => { input.checked = checked(); });
  return el("label", { className: "checkbox-row" }, [input, label]);
}

const historicalWrap = el("div", {}, [
  overlayCheckbox("Temporal (Roman unequal) hours", () => state.historicalHours.includes("temporal"), (v) => toggleHistorical("temporal", v)),
  overlayCheckbox("Babylonian hours (from sunrise)", () => state.historicalHours.includes("babylonian"), (v) => toggleHistorical("babylonian", v)),
  overlayCheckbox("Italian hours (from sunset)", () => state.historicalHours.includes("italian"), (v) => toggleHistorical("italian", v)),
]);
function toggleHistorical(system: HistoricalSystem, on: boolean) {
  state.historicalHours = on ? [...state.historicalHours, system] : state.historicalHours.filter((s) => s !== system);
}

const polarOverlays = el("div", {}, [
  overlayCheckbox("Declination (date) lines", () => state.showDeclinationLines, (v) => (state.showDeclinationLines = v)),
  el("p", { className: "hint" }, ["Historical hour systems (curves, computed day by day):"]),
  historicalWrap,
]);
const overlaysPanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Hours & overlays"]),
  fieldRow("Numerals", numeralsRow),
  overlayCheckbox("Zodiac entries", () => state.showZodiac, (v) => (state.showZodiac = v)),
  polarOverlays,
]);

// --- Sidebar: size + theme + motto ----------------------------------------

const radiusInput = el("input", { type: "number", value: String(state.radiusMm), attrs: { step: "5", min: "30", max: "400" } }) as HTMLInputElement;

const themeRow = segmented(
  (Object.keys(THEME_LABELS) as Theme[]).map((v) => ({ value: v, label: THEME_LABELS[v] })),
  () => state.theme,
  (v) => {
    state.theme = v;
  },
);

const PLATE_SHAPE_LABELS: Record<PlateShape, string> = { fan: "Fan (classic, no wasted plate)", circle: "Full circle" };
const plateShapeRow = segmented(
  (Object.keys(PLATE_SHAPE_LABELS) as PlateShape[]).map((v) => ({ value: v, label: PLATE_SHAPE_LABELS[v] })),
  () => state.plateShape,
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
  renderEdited();
});

const radiusField = fieldRow(state.dialType === "analemmatic" ? "Semi-major axis (mm)" : "Dial radius (mm)", radiusInput);
bindNumber(radiusInput, "Radius", 30, 400, (v) => { state.radiusMm = v; });

const appearancePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Size & appearance"]),
  radiusField,
  plateShapeField,
  fieldRow("Theme", themeRow),
  fieldRow("Motto", mottoSelect),
]);

// Editable design files are explicit downloads; coordinates are not persisted in browser storage.
const saveDesignBtn = el("button", { type: "button" }, ["Save design"]);
const openDesignBtn = el("button", { type: "button" }, ["Open design"]);
const cancelOpenBtn = el("button", { type: "button", hidden: true }, ["Cancel open"]);
const designFileInput = el("input", { type: "file", hidden: true, accept: ".gnomon.json,.json,application/json", attrs: { "aria-label": "Gnomon design file" } });
const fileStatus = el("p", { id: "design-file-status", className: "hint", attrs: { role: "status", "aria-live": "polite" } });
const designFilePanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Design file"]),
  el("div", { className: "export-grid" }, [saveDesignBtn, openDesignBtn]),
  cancelOpenBtn, designFileInput, fileStatus,
  el("p", { className: "hint" }, ["Save an editable design to resume or share. Includes the location and selected date and time. Files stay on your device."]),
]);
let openRequest = 0;
let readingDesign = false;

const sidebar = el("aside", { className: "dial-settings", id: "settings", tabIndex: -1, attrs: { "aria-label": "Dial settings" } }, [designFilePanel, locationPanel, dialTypePanel, timeModePanel, overlaysPanel, appearancePanel]);

// --- Stage -----------------------------------------------------------------

const nowBtn = el("button", { type: "button", attrs: { "aria-pressed": "true" } }, ["Now"]);
const playBtn = el("button", { type: "button", className: "ghost", attrs: { "aria-pressed": "false" } }, ["▶ Animate day"]);
function stopPlaying(): void {
  state.playing = false;
  playBtn.textContent = "▶ Animate day";
  playBtn.setAttribute("aria-pressed", "false");
}
nowBtn.addEventListener("click", () => {
  state.simMode = "now";
  stopPlaying();
  renderEdited();
});
dateInput.addEventListener("change", () => {
  state.simMode = "custom";
  stopPlaying();
  syncCustomDateTime();
  renderEdited();
});
timeInput.addEventListener("input", () => {
  state.simMode = "custom";
  stopPlaying();
  if (timeInput.value) {
    const [hours, minutes] = timeInput.value.split(":").map(Number);
    timeSlider.value = String(hours! * 60 + minutes!);
  }
  syncCustomDateTime();
  renderEdited();
});
timeSlider.addEventListener("input", () => {
  state.simMode = "custom";
  stopPlaying();
  const minutes = Number(timeSlider.value);
  timeInput.value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  syncCustomDateTime();
  renderEdited();
});
playBtn.addEventListener("click", () => {
  state.playing = !state.playing;
  state.simMode = "custom";
  playBtn.textContent = state.playing ? "❚❚ Pause" : "▶ Animate day";
  playBtn.setAttribute("aria-pressed", String(state.playing));
  renderEdited();
});

function syncCustomDateTime() {
  state.customDateTimeLocal = `${dateInput.value}T${timeInput.value}`;
}

function setSimulationInstant(instant: Date): void {
  state.customDateTimeLocal = zonedDateTimeInput(instant, state.timeZone);
  const [date, time] = state.customDateTimeLocal.split("T");
  dateInput.value = date!;
  timeInput.value = time!;
  timeSlider.value = String(Number(time!.slice(0, 2)) * 60 + Number(time!.slice(3, 5)));
  const result = resolveLocalDateTime(state.customDateTimeLocal, state.timeZone);
  state.timeDisambiguation = result.kind === "valid" && result.instants.length > 1
    && instant.getTime() >= result.instants[1]!.getTime() ? "later" : "earlier";
}

const exportSvgBtn = el("button", { type: "button", className: "primary" }, ["Download SVG"]);
const exportPdfA4Btn = el("button", { type: "button" }, ["PDF (A4)"]);
const exportPdfLetterBtn = el("button", { type: "button" }, ["PDF (Letter)"]);
const exportPngBtn = el("button", { type: "button" }, ["PNG"]);
const exportGnomonBtn = el("button", { type: "button", className: "ghost" }, ["Gnomon SVG"]);
const exportStatus = el("p", { className: "hint", attrs: { role: "status" } });
const exportCapability = el("p", { className: "hint" });
const exportPlan = el("p", { className: "hint", attrs: { "aria-live": "polite" } });

const stage = el("section", { className: "stage", id: "preview", tabIndex: -1, attrs: { "aria-label": "Sundial preview" } }, [
  el("h2", {}, ["Shadow simulator"]),
  el("a", { className: "settings-link", href: "#settings" }, ["Edit dial settings"]),
  el("div", { className: "stage-toolbar" }, [
    el("div", { className: "time-controls" }, [
      nowBtn,
      playBtn,
      dateInput,
      timeInput,
      el("div", { className: "slider-wrap" }, [timeSlider]),
      timeReadout,
      foldSelect,
    ]),
  ]),
  simulationNote,
  designStatus,
  svgStageWrap,
  el("div", { className: "preview-controls", attrs: { "aria-label": "Drawing magnification" } }, [zoomOut, zoomReadout, zoomIn, zoomReset]),
  timeBasisNote,
  readout,
]);

// --- Details rail ------------------------------------------------------

const exportPanel = el("section", { className: "panel" }, [
  el("h2", {}, ["Export"]),
  el("div", { className: "export-grid" }, [exportSvgBtn, exportPngBtn, exportPdfA4Btn, exportPdfLetterBtn]),
  exportGnomonBtn,
  exportPlan,
  exportStatus,
  exportCapability,
  el("p", { className: "hint" }, [
    "Laser SVG uses red strokes for cuts (outer edge, gnomon outline) and black for engraving (hour lines, numerals) — the common convention for hobby laser software.",
  ]),
]);

const orientationPanel = el("section", { className: "panel" }, [el("h2", {}, ["Mounting"]), orientationText]);
const gnomonPanel = el("section", { className: "panel" }, [el("h2", {}, ["Gnomon template"]), gnomonThumb, gnomonNote]);
const mottoPanel = el("section", { className: "panel" }, [el("h2", {}, ["Motto"]), mottoBox]);
const eotHeading = el("h2", {}, ["Equation of time"]);
const eotPanel = el("section", { className: "panel" }, [eotHeading, eotTableWrap]);

const detailsRail = el("aside", { className: "details-rail", attrs: { "aria-label": "Construction details and export" } }, [orientationPanel, gnomonPanel, exportPanel, mottoPanel, eotPanel]);

// --- Header, instructions, footer -----------------------------------------

const header = el("header", { className: "masthead" }, [
  el("h1", { className: "wordmark" }, ["Gnomon", el("small", {}, ["sundial designer"])]),
  el("p", { className: "tagline" }, [
    "Design a sundial for your location. Inspect the shadow, print at scale, and set it in the sun.",
  ]),
]);

const polarGnomonSetup = "The style angle is measured from the dial face. Its edge must lie parallel to Earth's axis and project out of the face. On a northern, south-facing wall it slopes outward and downward; its extension through the wall points at the north celestial pole. Follow the mounting directions for the selected dial.";
const gnomonSetupText = el("p", {}, [polarGnomonSetup]);
const instructionsSection = el("section", { className: "section", attrs: { id: "instructions" } }, [
  el("h2", {}, ["Setting it up"]),
  el("div", { className: "instructions-grid" }, [
    el("div", { className: "panel" }, [
      el("h3", {}, ["1. Find true north"]),
      el("p", {}, [
        "A compass points at magnetic north, not true north — the difference (magnetic declination) is several degrees almost everywhere and changes over time. Look up your local declination (e.g. via NOAA's calculator) and correct for it, or use a surveyed true-north reference. In the Northern Hemisphere, Polaris gives an approximate north reference at night.",
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
      gnomonSetupText,
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
    el("a", { className: "skip-link", href: "#preview" }, ["Skip to sundial preview"]),
    header,
    el("main", { className: "page-main" }, [
      el("div", { className: "layout" }, [stage, sidebar, detailsRail]),
      instructionsSection,
      oracleNote,
    ]),
    footer,
  ]),
);

// --- Render loop -------------------------------------------------------

let lastDesignKey = "";
let lastDesign: DesignSnapshot | null = null;
let lastEotYear = 0;

function updateExportButtons(): void {
  const unavailable = !currentDesign || exportPending;
  const analemmatic = state.dialType === "analemmatic";
  saveDesignBtn.disabled = unavailable;
  cancelOpenBtn.hidden = !readingDesign;
  designFilePanel.setAttribute("aria-busy", String(readingDesign));
  exportSvgBtn.disabled = unavailable;
  exportPngBtn.disabled = unavailable;
  exportPdfA4Btn.disabled = unavailable || analemmatic;
  exportPdfLetterBtn.disabled = unavailable || analemmatic;
  exportGnomonBtn.disabled = unavailable || analemmatic;
  exportPanel.setAttribute("aria-busy", String(exportPending));
  let printSummary = "";
  if (currentDesign && currentDesign.dial.kind !== "analemmatic") {
    const design = currentDesign;
    const dial = currentDesign.dial;
    printSummary = (["a4", "letter"] as const).map((format) => {
      const plan = planConstructionPrint(dial, { ...design.polarOptions, format });
      const plate = plan.plate;
      return `${format === "a4" ? "A4" : "Letter"}: ${plan.pageCount} pages total — plate ${plate.tiled ? `${plate.tiles.length} sheets (${plate.columns} across, ${plate.rows} down) + guide` : "1 sheet"}; gnomon ${plan.gnomon.tiled ? `${plan.gnomon.tiles.length} sheets + guide` : "1 sheet"}`;
    }).join(". ") + ".";
  }
  if (exportPlan.textContent !== printSummary) exportPlan.textContent = printSummary;
}

function showInvalidDesign(message: string): void {
  currentDesign = null;
  stopPlaying();
  playBtn.disabled = true;
  designStatus.textContent = `${message} Preview shows the last valid design; downloads are paused.`;
  designStatus.className = "field-error";
  updateExportButtons();
}

function render(): void {
  wallDeclinationField.style.display = state.dialType === "vertical" ? "" : "none";
  wallHint.style.display = state.dialType === "vertical" ? "" : "none";
  plateShapeField.style.display = state.dialType === "analemmatic" ? "none" : "";
  radiusField.querySelector("label")!.textContent = state.dialType === "analemmatic" ? "Semi-major axis (mm)" : "Dial radius (mm)";
  const analemmatic = state.dialType === "analemmatic";
  timeModePanel.querySelector<HTMLElement>(".polar-time-controls")!.hidden = analemmatic;
  timeModePanel.querySelector<HTMLElement>(".analemmatic-note")!.hidden = !analemmatic;
  polarOverlays.hidden = analemmatic;
  dstRow.hidden = state.timeMode !== "standard";
  stage.querySelector<HTMLElement>(".stage-toolbar")!.hidden = analemmatic;
  stage.querySelector("h2")!.textContent = analemmatic ? "Dial preview" : "Shadow simulator";
  exportCapability.textContent = analemmatic
    ? "This layout exports as SVG or PNG. It uses a movable vertical rod, so there is no fixed gnomon template or PDF export."
    : "PDFs include the matching gnomon template and mounting instructions. Large pieces use full-size sheets with 10 mm overlaps. Print at 100% and check every 100 mm bar. The simulated shadow is preview-only.";
  nowBtn.setAttribute("aria-pressed", String(state.simMode === "now"));
  designStatus.textContent = "";
  designStatus.className = "hint";
  if (invalidFields.size) {
    showInvalidDesign("Correct the highlighted settings.");
    return;
  }
  const now = new Date();
  if (state.simMode === "now") setSimulationInstant(now);
  const localResult = resolveLocalDateTime(state.customDateTimeLocal, state.timeZone);
  const repeated = state.simMode === "custom" && localResult.kind === "valid" && localResult.instants.length > 1;
  foldSelect.hidden = !repeated;
  if (repeated && localResult.kind === "valid") {
    const labels = localResult.instants.map((instant, i) => `${i ? "Second" : "First"} occurrence (${formatUtcOffset(offsetMinutesAt(state.timeZone, instant))})`);
    if (foldSelect.options[0]?.text !== labels[0] || foldSelect.options[1]?.text !== labels[1]) {
      foldSelect.replaceChildren(...labels.map((label, i) => el("option", { value: i ? "later" : "earlier" }, [label])));
    }
    foldSelect.value = state.timeDisambiguation;
  }
  dateInput.setAttribute("aria-invalid", String(localResult.kind === "invalid"));
  timeInput.setAttribute("aria-invalid", String(localResult.kind !== "valid"));
  if (localResult.kind !== "valid") {
    simulationNote.textContent = localResult.message;
    timeReadout.textContent = "No simulated instant";
    showInvalidDesign("Choose a valid simulation date and time.");
    return;
  }
  const instant = state.simMode === "now" ? now : currentInstant()!;
  const local = zonedDateTimeInput(instant, state.timeZone);
  const offset = formatUtcOffset(offsetMinutesAt(state.timeZone, instant));
  timeReadout.textContent = `${local.replace("T", " ")} ${offset}`;
  timeSlider.setAttribute("aria-valuetext", `${timeInput.value} in ${state.timeZone}`);
  const simulationMessage = analemmatic
    ? "The date scale sets the position of your vertical rod. Shadow animation is available for the three polar-style dials."
    : `Date and time in ${state.timeZone}. ${repeated ? "This clock time occurs twice; choose an occurrence above." : "Automatic dial clock adjustment follows this simulation date."}`;
  if (simulationNote.textContent !== simulationMessage) simulationNote.textContent = simulationMessage;
  const key = JSON.stringify({ ...state, customDateTimeLocal: local.slice(0, 10), simMode: "custom", timeDisambiguation: "earlier", playing: false, offset });
  let design: DesignSnapshot;
  try {
    if (key !== lastDesignKey || !lastDesign) {
      lastDesign = captureDesign(state, instant);
      lastDesignKey = key;
    }
    design = lastDesign;
    requireUsableDesign(design);
  } catch (error) {
    showInvalidDesign(error instanceof Error ? error.message : String(error));
    return;
  }
  currentDesign = design;
  playBtn.disabled = false;
  svgStageWrap.dataset.theme = state.theme;
  gnomonThumb.dataset.theme = state.theme;
  const { dial } = design;
  updateExportButtons();
  timeBasisNote.textContent = `Hour labels: ${design.timeBasis}.`;
  const previewScroll = { left: svgStageWrap.scrollLeft, top: svgStageWrap.scrollTop };
  clear(svgStageWrap);
  readout.replaceChildren();
  if (dial.kind === "analemmatic") {
    svgStageWrap.innerHTML = renderAnalemmaticSVG(dial, { ...design.analemmaticOptions, theme: state.theme });
    orientationText.textContent = "Lay flat and level, top of the design toward true north, major axis east-west. For a date marked on the scale, put the vertical rod's base at its matching mark and read the apparent solar hour where the shadow points across the ellipse.";
    gnomonSetupText.textContent = "Use a vertical rod, checked with a plumb line, with its base at the selected date mark. You can also stand upright on the mark. The shadow direction points toward the apparent solar hour on the ellipse.";
    gnomonThumb.replaceChildren("No fixed gnomon: use a vertical rod or stand on the date scale.");
    gnomonNote.textContent = "";
  } else {
    gnomonSetupText.textContent = polarGnomonSetup;
    const shadow = simulatePolarShadow(instant, state.latitudeDeg, state.longitudeDeg, buildDialPlane(dial.kind, state.latitudeDeg, state.wallDeclinationDeg), state.radiusMm * 0.32);
    svgStageWrap.innerHTML = renderPolarDialSVG(dial, { ...design.polarOptions, theme: state.theme, shadowTip: shadow.visible ? shadow.tip : null });
    orientationText.textContent = dial.orientation;
    gnomonThumb.innerHTML = renderGnomonSVG(dial, { theme: state.theme, marginMm: 8 });
    gnomonNote.textContent = gnomonConstructionWarning(dial)
      ?? "The PDF includes this piece at full size. Match the filled foot dots and, for a triangle, the open base-end circles. A bead or notch at the cross makes the date-line shadow.";
    readout.replaceChildren(
      el("span", {}, [el("strong", {}, ["alt "]), `${shadow.altitudeDeg.toFixed(1)}°`]),
      el("span", {}, [el("strong", {}, ["az "]), `${shadow.azimuthDeg.toFixed(1)}°`]),
      el("span", {}, [el("strong", {}, ["hour angle "]), `${shadow.hourAngleDeg.toFixed(1)}°`]),
      el("span", {}, [el("strong", {}, ["declination "]), `${shadow.declinationDeg.toFixed(2)}°`]),
      el("span", {}, [el("strong", {}, ["equation of time "]), `${shadow.equationOfTimeMin >= 0 ? "+" : ""}${shadow.equationOfTimeMin.toFixed(1)} min`]),
      el("span", {}, [shadow.visible ? "shadow visible on this face" : "sun not illuminating this face at this time"]),
    );
  }
  svgStageWrap.querySelector("svg")?.setAttribute("role", "img");
  svgStageWrap.querySelector("svg")?.setAttribute("aria-label", design.title);
  updatePreviewZoom();
  svgStageWrap.scrollLeft = previewScroll.left;
  svgStageWrap.scrollTop = previewScroll.top;
  const thumb = gnomonThumb.querySelector("svg");
  thumb?.setAttribute("role", "img");
  thumb?.setAttribute("aria-label", "Gnomon cutting template");
  if (state.mottoIndex !== null) {
    const m = MOTTOES[state.mottoIndex]!;
    mottoBox.replaceChildren(
      el("p", { className: "latin" }, [m.latin]),
      el("p", { className: "translation" }, [`"${m.translation}"`]),
      el("p", { className: "attribution" }, [m.attribution + (m.note ? ` — ${m.note}` : "")]),
    );
  } else mottoBox.replaceChildren(el("p", { className: "hint" }, ["Pick a motto in Size & appearance."]));
  renderEotTable(Number(local.slice(0, 4)));
}

function renderEotTable(year: number): void {
  if (lastEotYear === year) return;
  lastEotYear = year;
  eotHeading.textContent = `Equation of time (${year})`;
  const rows = equationOfTimeTable(year, [1, 15]);
  const table = el("table", { className: "eot-table" }, [
    el("thead", {}, [el("tr", {}, [el("th", { scope: "col" }, ["Date"]), el("th", { scope: "col" }, ["EoT (min)"])])]),
    el("tbody", {}, rows.map((r) => el("tr", {}, [el("td", {}, [r.label]), el("td", {}, [`${r.equationOfTimeMin >= 0 ? "+" : ""}${r.equationOfTimeMin.toFixed(1)}`])]))),
  ]);
  eotTableWrap.replaceChildren(table);
}

// --- Export handlers ---------------------------------------------------

async function runExport(produce: (design: DesignSnapshot) => Promise<string> | string): Promise<void> {
  if (!currentDesign || exportPending) return;
  const design = currentDesign;
  exportPending = true;
  exportStatus.textContent = `Preparing ${design.settings.dialType} design...`;
  exportStatus.className = "hint";
  updateExportButtons();
  try {
    exportStatus.textContent = await produce(design);
  } catch (error) {
    exportStatus.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
    exportStatus.className = "field-error";
  } finally {
    exportPending = false;
    updateExportButtons();
  }
}

exportSvgBtn.addEventListener("click", () => void runExport((design) => {
  const filename = `gnomon-${design.settings.dialType}.svg`;
  downloadBlob(new Blob([designSvg(design, "laser")], { type: "image/svg+xml" }), filename);
  return `Downloaded ${filename} at physical millimetre scale.`;
}));
exportGnomonBtn.addEventListener("click", () => void runExport((design) => {
  if (design.dial.kind === "analemmatic") throw new Error("This dial uses a movable vertical rod.");
  const filename = `gnomon-style-${design.settings.dialType}.svg`;
  downloadBlob(new Blob([renderGnomonSVG(design.dial, { theme: "laser", marginMm: 8 })], { type: "image/svg+xml" }), filename);
  return `Downloaded ${filename}.`;
}));
exportPngBtn.addEventListener("click", () => void runExport(async (design) => {
  const svg = designSvg(design, design.settings.theme);
  const match = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg);
  if (!match) throw new Error("Cannot determine the design's dimensions. Use SVG instead.");
  const dimensions = pngDimensions(Number(match[1]), Number(match[2]));
  const blob = await svgToPngBlob(svg, dimensions.width, dimensions.height);
  const filename = `gnomon-${design.settings.dialType}.png`;
  downloadBlob(blob, filename);
  return `Downloaded ${filename}: ${dimensions.width} × ${dimensions.height} pixels (about ${dimensions.dpi.toFixed(0)} DPI). Use SVG or PDF for physical scale.`;
}));
async function exportPdf(format: "a4" | "letter"): Promise<void> {
  await runExport(async (design) => {
    if (design.dial.kind === "analemmatic") throw new Error("Use SVG for the analemmatic layout.");
    const bytes = exportConstructionPDF(design.dial, { ...design.polarOptions, format });
    const plan = planConstructionPrint(design.dial, { ...design.polarOptions, format });
    const filename = `gnomon-${design.settings.dialType}-${format}.pdf`;
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
    return `Downloaded ${filename}: ${plan.pageCount} ${plan.pageCount === 1 ? "page" : "pages"}. Print at actual size and measure every 100 mm calibration bar.`;
  });
}
exportPdfA4Btn.addEventListener("click", () => void exportPdf("a4"));
exportPdfLetterBtn.addEventListener("click", () => void exportPdf("letter"));

function applyOpenedDesign(opened: OpenedDesign): void {
  stopPlaying();
  retireLocation();
  [...invalidFields.keys()].forEach(clearFieldError);
  Object.assign(state, opened.state);
  latInput.value = String(state.latitudeDeg);
  lonInput.value = String(state.longitudeDeg);
  tzInput.value = state.timeZone;
  wallInput.value = String(state.wallDeclinationDeg);
  radiusInput.value = String(state.radiusMm);
  dstSelect.value = state.dstOffsetOverride === null ? "auto" : String(state.dstOffsetOverride);
  mottoSelect.value = String(state.mottoIndex ?? -1);
  syncControls.forEach(sync => sync());
  setSimulationInstant(opened.instant);
  lastDesignKey = "";
  editRevision++;
  render();
}

saveDesignBtn.addEventListener("click", () => {
  if (!currentDesign || exportPending) return;
  const instant = currentInstant();
  if (!instant) return;
  try {
    const text = saveDesignFile(state, instant);
    downloadBlob(new Blob([text], { type: "application/json" }), `gnomon-${state.dialType}.gnomon.json`);
    fileStatus.className = "hint";
    fileStatus.textContent = "Design saved with a fixed simulation minute. Use Open design to resume it.";
  } catch (error) {
    fileStatus.className = "field-error";
    fileStatus.textContent = `Could not save the design: ${error instanceof Error ? error.message : String(error)}`;
  }
});

function cancelDesignRead(): void {
  openRequest++;
  readingDesign = false;
  updateExportButtons();
}
openDesignBtn.addEventListener("click", () => {
  if (readingDesign) {
    cancelDesignRead();
    fileStatus.textContent = "Previous open canceled. Choose a design file.";
  }
  designFileInput.click();
});
cancelOpenBtn.addEventListener("click", () => {
  cancelDesignRead();
  fileStatus.className = "hint";
  fileStatus.textContent = "Open canceled. Your current design is unchanged.";
});
designFileInput.addEventListener("change", () => {
  const file = designFileInput.files?.[0];
  designFileInput.value = ""; // Selecting the same file again must allow a retry.
  if (file) void readDesignFile(file);
});

async function readDesignFile(file: File): Promise<void> {
  const request = ++openRequest;
  const revision = editRevision;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  readingDesign = true;
  fileStatus.className = "hint";
  fileStatus.textContent = `Opening ${file.name}...`;
  updateExportButtons();
  try {
    if (file.size > MAX_DESIGN_FILE_BYTES) throw new Error("Design files must be 16 KiB or smaller.");
    const bytes = await Promise.race([
      file.arrayBuffer(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("The file read timed out. Try opening it again.")), 15_000); }),
    ]);
    if (request !== openRequest) return;
    if (revision !== editRevision) throw new Error("Settings changed while the file was opening. Open it again to replace them.");
    const opened = openDesignFile(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    applyOpenedDesign(opened);
    fileStatus.textContent = `Opened ${file.name}. Simulation paused at the saved date and time.`;
  } catch (error) {
    if (request === openRequest) {
      fileStatus.className = "field-error";
      fileStatus.textContent = `Could not open the design: ${error instanceof Error ? error.message : String(error)} Your current settings are unchanged.`;
    }
  } finally {
    clearTimeout(timeout);
    if (request === openRequest) { readingDesign = false; updateExportButtons(); }
  }
}

// Advance elapsed time so DST gaps are skipped and repeated minutes remain
// selectable. Stop at the next local day instead of jumping back to noon.
const tick = setInterval(() => {
  if (document.hidden) return;
  if (state.simMode === "now") render();
  else if (state.playing) {
    const instant = currentInstant();
    if (!instant) { stopPlaying(); return; }
    const next = new Date(instant.getTime() + 4 * 60_000);
    if (zonedDateTimeInput(next, state.timeZone).slice(0, 10) !== dateInput.value) {
      stopPlaying();
    } else {
      setSimulationInstant(next);
    }
    render();
  }
}, 1000);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) clearInterval(tick);
  cancelLocation();
  stopPlaying();
});
window.addEventListener("pageshow", () => render());
setSimulationInstant(new Date());
render();
