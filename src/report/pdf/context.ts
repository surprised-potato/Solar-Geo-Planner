import { jsPDF } from 'jspdf';
import { ProjectStore } from '../../store/projectStore';
import { ReportBundleData, ReportExportOptions } from '../reportTypes';
import { renderCadViewPng } from '../cadSnapshot';

export type RGB = [number, number, number];

export const COLORS = {
  navy: [30, 58, 138] as RGB,
  ink: [15, 23, 42] as RGB,
  slate: [71, 85, 105] as RGB,
  body: [51, 65, 85] as RGB,
  muted: [100, 116, 139] as RGB,
  faint: [148, 163, 184] as RGB,
  line: [226, 232, 240] as RGB,
  border: [203, 213, 225] as RGB,
  zebra: [248, 250, 252] as RGB,
  white: [255, 255, 255] as RGB,
  amber: [245, 158, 11] as RGB,
  green: [4, 120, 87] as RGB,
  greenBg: [209, 250, 229] as RGB,
  red: [185, 28, 28] as RGB,
  redBg: [254, 226, 226] as RGB,
  greyBg: [226, 232, 240] as RGB
};

/** Page margin in mm. */
export const M = 12;

const ALLOWED_EXTRA = new Set([
  0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac, 0x2122
]);

const REPLACEMENTS: Record<string, string> = {
  'Φ': 'ph', // Φ
  'φ': 'ph',
  '≤': '<=',
  '≥': '>=',
  '⏚': '(GND)', // ⏚
  '₱': 'PHP ', // ₱
  '→': '->',
  '−': '-',
  'Ω': 'ohm',
  'Ω': 'ohm',
  'Σ': 'Sum',
  '≈': '~',
  ' ': ' '
};

/**
 * jsPDF's built-in Helvetica only covers WinAnsi. Replace/strip anything outside it so
 * text never renders as garbled glyphs.
 */
export function pdfSafe(input: unknown): string {
  const s = input === null || input === undefined ? '' : String(input);
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 256 || ALLOWED_EXTRA.has(cp)) {
      out += ch === ' ' ? ' ' : ch;
    } else if (REPLACEMENTS[ch] !== undefined) {
      out += REPLACEMENTS[ch];
    } else {
      out += '?';
    }
  }
  return out;
}

export function php(n: number | undefined | null): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return 'PHP ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(n: number | undefined | null, digits = 0): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Finite-safe percentage value (NaN/Infinity from empty profiles become 0). */
export function pct(n: number | undefined | null): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

export type PaperFormat = 'a4' | 'a3' | 'a2';

/** Portrait page size in mm. */
export const PAPER_MM: Record<PaperFormat, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  a2: { w: 420, h: 594 }
};

export function pageSizeMm(format: PaperFormat, landscape: boolean): { w: number; h: number } {
  const p = PAPER_MM[format];
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

export interface PageMeta {
  format: PaperFormat;
  sheet: number; // 0 = cover / contents (not a numbered sheet)
  title: string;
  landscape: boolean;
  chrome: boolean;
}

export interface TocEntry {
  id: string;
  sheet: number;
  title: string;
  startPage: number;
  endPage: number;
}

export interface TextOpts {
  style?: 'normal' | 'bold' | 'italic';
  size?: number;
  color?: RGB;
  align?: 'left' | 'right' | 'center';
  /** Truncate to a single line of this width (mm). */
  maxW?: number;
}

/**
 * Shared drawing state for one rendering pass of the report. Sections draw into the
 * context; it owns pagination, headers/footers and the table of contents bookkeeping.
 */
export class ReportCtx {
  readonly doc: jsPDF;
  readonly pages: PageMeta[] = [];
  readonly toc: TocEntry[] = [];
  /** Title printed in the page header. */
  reportTitle = 'SOLAR GEO PLANNER \u2014 SIMULATION & ENGINEERING REPORT';
  sheet = 0;
  y = 22;
  /** Sheets that will be rendered, in order (used by the contents page). */
  planned: { id: string; title: string; blurb: string }[] = [];
  private firstPageFree = true;
  private initialLandscape: boolean;
  private cadPromise?: Promise<string | null>;

  constructor(
    readonly store: ProjectStore,
    readonly bundle: ReportBundleData,
    readonly options: ReportExportOptions,
    /** Dry runs lay out pages exactly like a real run but skip image rasterization. */
    readonly dry: boolean,
    readonly priorToc: TocEntry[],
    startLandscape: boolean
  ) {
    this.initialLandscape = startLandscape;
    this.doc = new jsPDF({
      orientation: startLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      compress: true,
      format: 'a4'
    });
  }

  get landscape(): boolean {
    return this.pages.length ? this.pages[this.pages.length - 1].landscape : false;
  }
  get format(): PaperFormat {
    return this.pages.length ? this.pages[this.pages.length - 1].format : 'a4';
  }
  get pageW(): number {
    return pageSizeMm(this.format, this.landscape).w;
  }
  get pageH(): number {
    return pageSizeMm(this.format, this.landscape).h;
  }
  get contentW(): number {
    return this.pageW - 2 * M;
  }
  /** Lowest y a section may draw to (above the footer). */
  get bottom(): number {
    return this.pageH - 16;
  }
  get pageNo(): number {
    return this.pages.length;
  }

  // ---- text helpers -------------------------------------------------------

  font(style: 'normal' | 'bold' | 'italic' = 'normal', size = 8, color: RGB = COLORS.body): void {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  t(text: unknown, x: number, y: number, o: TextOpts = {}): void {
    this.font(o.style ?? 'normal', o.size ?? 8, o.color ?? COLORS.body);
    let s = pdfSafe(text);
    if (o.maxW) {
      const lines = this.doc.splitTextToSize(s, o.maxW) as string[];
      s = lines[0] ?? '';
    }
    this.doc.text(s, x, y, o.align ? { align: o.align } : undefined);
  }

  /** Draws wrapped text; returns the y just below the last line. */
  wrap(text: unknown, x: number, y: number, w: number, o: TextOpts = {}, lineH = 4): number {
    this.font(o.style ?? 'normal', o.size ?? 8, o.color ?? COLORS.body);
    const lines = this.doc.splitTextToSize(pdfSafe(text), w) as string[];
    for (const ln of lines) {
      this.doc.text(ln, x, y);
      y += lineH;
    }
    return y;
  }

  fill(c: RGB): void {
    this.doc.setFillColor(c[0], c[1], c[2]);
  }
  stroke(c: RGB, w = 0.3): void {
    this.doc.setDrawColor(c[0], c[1], c[2]);
    this.doc.setLineWidth(w);
  }

  // ---- pagination ---------------------------------------------------------

  newPage(landscape: boolean, meta: Omit<PageMeta, 'landscape' | 'format'>, format: PaperFormat = 'a4'): void {
    const orientation = landscape ? 'landscape' : 'portrait';
    if (this.firstPageFree) {
      this.firstPageFree = false;
      if (landscape !== this.initialLandscape || format !== 'a4') {
        // The auto-created first page (A4) has the wrong size/orientation: replace it.
        this.doc.addPage(format, orientation);
        this.doc.deletePage(1);
      }
    } else {
      this.doc.addPage(format, orientation);
    }
    this.pages.push({ ...meta, landscape, format });
    this.y = 22;
  }

  /** Starts a numbered sheet (new page + heading + table-of-contents entry). */
  beginSection(id: string, title: string, opts: { landscape?: boolean; format?: PaperFormat; subtitle?: string } = {}): void {
    this.sheet++;
    this.newPage(!!opts.landscape, { sheet: this.sheet, title, chrome: true }, opts.format ?? 'a4');
    this.toc.push({ id, sheet: this.sheet, title, startPage: this.pageNo, endPage: this.pageNo });
    this.heading(title, opts.subtitle);
  }

  /** Continues the current sheet on a fresh page of the same orientation. */
  continuePage(title?: string): void {
    const cur = this.pages[this.pages.length - 1];
    this.newPage(cur.landscape, { sheet: cur.sheet, title: cur.title, chrome: true }, cur.format);
    const shown = title ?? `${cur.title} (cont.)`;
    this.t(shown, M, 25, { style: 'bold', size: 11, color: COLORS.ink });
    this.y = 31;
  }

  ensureSpace(h: number): void {
    if (this.y + h > this.bottom) this.continuePage();
  }

  heading(title: string, subtitle?: string): void {
    this.t(`SHEET ${this.sheet}`, M, 24.5, { style: 'bold', size: 7, color: COLORS.amber });
    this.t(title, M, 31, { style: 'bold', size: 16, color: COLORS.ink });
    this.y = 36;
    if (subtitle) {
      this.y = this.wrap(subtitle, M, 36.5, this.contentW, { size: 8.5, color: COLORS.slate }, 4) + 1;
    }
    this.y += 1.5;
  }

  /** Sub-heading inside a sheet with a thin rule. */
  subheading(text: string): void {
    this.ensureSpace(14);
    this.t(text, M, this.y + 4, { style: 'bold', size: 10, color: COLORS.ink });
    this.stroke(COLORS.line, 0.3);
    this.doc.line(M, this.y + 6, M + this.contentW, this.y + 6);
    this.y += 9;
  }

  paragraph(text: string, o: TextOpts = {}): void {
    const size = o.size ?? 8;
    const lineH = size * 0.5;
    this.font(o.style ?? 'normal', size, o.color ?? COLORS.body);
    const lines = this.doc.splitTextToSize(pdfSafe(text), this.contentW) as string[];
    for (const ln of lines) {
      this.ensureSpace(lineH + 1);
      this.doc.text(ln, M, this.y + lineH);
      this.y += lineH + 0.6;
    }
    this.y += 1.5;
  }

  // ---- reusable widgets ---------------------------------------------------

  kpiTiles(tiles: { label: string; value: string; sub?: string }[]): void {
    const h = 17;
    const gap = 3;
    this.ensureSpace(h + 4);
    const w = (this.contentW - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach((tile, i) => {
      const x = M + i * (w + gap);
      this.fill(COLORS.zebra);
      this.stroke(COLORS.border, 0.3);
      this.doc.roundedRect(x, this.y, w, h, 1.5, 1.5, 'FD');
      this.t(tile.label.toUpperCase(), x + 3, this.y + 4.5, { style: 'bold', size: 6.2, color: COLORS.muted, maxW: w - 5 });
      this.t(tile.value, x + 3, this.y + 10.5, { style: 'bold', size: 11, color: COLORS.navy, maxW: w - 5 });
      if (tile.sub) this.t(tile.sub, x + 3, this.y + 14.5, { size: 6.3, color: COLORS.muted, maxW: w - 5 });
    });
    this.y += h + 5;
  }

  /** Key/value card (PVsyst-style info block). Returns the height used. */
  kvCard(x: number, y: number, w: number, title: string, rows: [string, string][]): number {
    const headH = 6.5;
    const rowH = 5.2;
    this.fill(COLORS.ink);
    this.doc.rect(x, y, w, headH, 'F');
    this.t(title.toUpperCase(), x + 3, y + 4.4, { style: 'bold', size: 7.5, color: COLORS.white, maxW: w - 6 });
    let yy = y + headH;
    rows.forEach((r, i) => {
      this.fill(i % 2 === 1 ? COLORS.zebra : COLORS.white);
      this.doc.rect(x, yy, w, rowH, 'F');
      this.t(r[0], x + 3, yy + 3.6, { size: 7, color: COLORS.slate, maxW: w * 0.55 });
      this.t(r[1], x + w - 3, yy + 3.6, { style: 'bold', size: 7, color: COLORS.ink, align: 'right', maxW: w * 0.45 });
      yy += rowH;
    });
    this.stroke(COLORS.border, 0.3);
    this.doc.rect(x, y, w, yy - y);
    return yy - y;
  }

  /** Two key/value cards side by side, advancing y by the taller one. */
  kvCardsRow(
    left: { title: string; rows: [string, string][] },
    right: { title: string; rows: [string, string][] }
  ): void {
    const colW = (this.contentW - 6) / 2;
    const need = 6.5 + 5.2 * Math.max(left.rows.length, right.rows.length) + 4;
    this.ensureSpace(need);
    const h1 = this.kvCard(M, this.y, colW, left.title, left.rows);
    const h2 = this.kvCard(M + colW + 6, this.y, colW, right.title, right.rows);
    this.y += Math.max(h1, h2) + 5;
  }

  badge(x: number, y: number, w: number, status: 'PASS' | 'FAIL' | 'N/A' | 'WARN', label?: string): void {
    const map = {
      PASS: { bg: COLORS.greenBg, fg: COLORS.green, text: 'COMPLIANT' },
      FAIL: { bg: COLORS.redBg, fg: COLORS.red, text: 'NON-COMPLIANT' },
      WARN: { bg: [254, 243, 199] as RGB, fg: [146, 64, 14] as RGB, text: 'REVIEW' },
      'N/A': { bg: COLORS.greyBg, fg: COLORS.muted, text: 'N/A' }
    } as const;
    const m = map[status];
    this.fill(m.bg);
    this.doc.roundedRect(x, y, w, 4.5, 1, 1, 'F');
    this.t(label ?? m.text, x + w / 2, y + 3.2, { style: 'bold', size: 6, color: m.fg, align: 'center' });
  }

  /** Boxed list of bullet points. */
  noteBox(title: string, lines: string[]): void {
    const lineH = 3.9;
    this.font('normal', 7.2, COLORS.body);
    const wrapped: string[] = [];
    for (const ln of lines) {
      const parts = this.doc.splitTextToSize(pdfSafe('• ' + ln), this.contentW - 10) as string[];
      parts.forEach((p, i) => wrapped.push(i === 0 ? p : '  ' + p));
    }
    const h = 10 + wrapped.length * lineH;
    this.ensureSpace(h + 3);
    this.fill(COLORS.zebra);
    this.stroke(COLORS.line, 0.3);
    this.doc.roundedRect(M, this.y, this.contentW, h, 2, 2, 'FD');
    this.t(title, M + 4, this.y + 6, { style: 'bold', size: 8.5, color: COLORS.navy });
    let yy = this.y + 11;
    this.font('normal', 7.2, COLORS.body);
    for (const ln of wrapped) {
      this.doc.text(ln, M + 4, yy);
      yy += lineH;
    }
    this.y += h + 4;
  }

  /**
   * Places an image produced by `produce`. Dry runs skip producing it. When no raster is
   * available (e.g. headless tests) a labelled placeholder frame is drawn instead.
   */
  async image(
    produce: () => Promise<string | { uri: string; aspect: number } | null>,
    x: number,
    y: number,
    w: number,
    h: number,
    placeholder: string
  ): Promise<void> {
    if (this.dry) return;
    let uri: string | null = null;
    let aspect: number | undefined;
    let failure = '';
    try {
      const res = await produce();
      if (res && typeof res === 'object') {
        uri = res.uri;
        aspect = res.aspect;
      } else {
        uri = res;
      }
    } catch (err) {
      uri = null;
      failure = err instanceof Error ? err.message : String(err);
      console.warn(`Report image "${placeholder}" failed:`, err);
    }
    this.stroke(COLORS.border, 0.3);
    const isPng = !!uri && uri.startsWith('data:image/png');
    const isJpg = !!uri && uri.startsWith('data:image/jpeg');
    if (isPng || isJpg) {
      let dw = w;
      let dh = h;
      if (aspect && aspect > 0) {
        dh = w / aspect;
        if (dh > h) {
          dh = h;
          dw = h * aspect;
        }
        this.doc.rect(x, y, w, h);
      }
      this.doc.addImage(uri!, isPng ? 'PNG' : 'JPEG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      this.fill(COLORS.zebra);
      this.doc.rect(x, y, w, h, 'FD');
      this.t(placeholder, x + w / 2, y + h / 2, { size: 8, color: COLORS.muted, align: 'center' });
      if (failure) {
        this.t(`Could not render: ${failure}`, x + w / 2, y + h / 2 + 5, { size: 6.5, color: COLORS.red, align: 'center', maxW: w - 10 });
      }
    }
  }

  /** Site layout raster, rendered once per pass and shared by cover + layout sheet. */
  cadImage(): Promise<string | null> {
    if (!this.cadPromise) {
      this.cadPromise = renderCadViewPng(this.store, {
        width: 1400,
        height: 880,
        systemId: this.options.systemId,
        satellite: this.options.satelliteBasemap !== false
      }).catch(() => null);
    }
    return this.cadPromise;
  }

  // ---- finishing ----------------------------------------------------------

  /** Fills in endPage on every TOC entry and draws header/footer on each page. */
  finalize(): void {
    for (const e of this.toc) {
      let end = e.startPage;
      this.pages.forEach((p, i) => {
        if (p.sheet === e.sheet) end = Math.max(end, i + 1);
      });
      e.endPage = end;
    }
    const total = this.pages.length;
    const variant = this.options.systemId === 'all' ? 'Consolidated Project' : this.systemVariantName();
    this.pages.forEach((meta, i) => {
      this.doc.setPage(i + 1);
      if (meta.chrome) this.drawChrome(i + 1, total, meta, variant);
    });
  }

  private systemVariantName(): string {
    return this.bundle.targetSystems[0]?.name ?? 'Selected System';
  }

  private drawChrome(pageNo: number, total: number, meta: PageMeta, variant: string): void {
    const { w: pageW, h: pageH } = pageSizeMm(meta.format, meta.landscape);
    this.fill(COLORS.navy);
    this.doc.rect(0, 0, pageW, 4, 'F');
    this.fill(COLORS.amber);
    this.doc.rect(0, 4, pageW * 0.35, 1.5, 'F');

    this.t(this.reportTitle, M, 11, { style: 'bold', size: 8.5, color: COLORS.ink });
    this.t(`${this.bundle.projectName} • ${variant}`, M, 15, { size: 7.5, color: COLORS.muted, maxW: pageW * 0.6 });
    this.t(`Date: ${this.options.reportDate}`, pageW - M, 11, { size: 7.5, color: COLORS.muted, align: 'right' });
    const paper = meta.format === 'a4' ? '' : ` • ${meta.format.toUpperCase()}`;
    const label = (meta.sheet > 0 ? `Sheet ${meta.sheet} — ${meta.title}` : meta.title) + paper;
    this.t(label, pageW - M, 15, { style: 'bold', size: 7.5, color: COLORS.navy, align: 'right', maxW: pageW * 0.4 });

    this.stroke(COLORS.line, 0.3);
    this.doc.line(M, 17, pageW - M, 17);
    this.doc.line(M, pageH - 11, pageW - M, pageH - 11);
    const company = this.options.companyName ? `${this.options.companyName} • ` : '';
    this.t(`${company}Generated with Solar Geo Planner`, M, pageH - 7, { size: 7, color: COLORS.faint });
    this.t(`Page ${pageNo} of ${total}`, pageW - M, pageH - 7, { size: 7, color: COLORS.faint, align: 'right' });
  }
}
