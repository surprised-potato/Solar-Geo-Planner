import { COLORS, M, ReportCtx, RGB } from './context';

export interface TableColumn {
  header: string;
  /** Relative width; columns are scaled to fill the content width. */
  width: number;
  align?: 'left' | 'right' | 'center';
  bold?: boolean;
  color?: RGB;
}

export interface TableOptions {
  columns: TableColumn[];
  rows: string[][];
  totals?: string[];
  fontSize?: number;
  rowH?: number;
  /** Per-cell text colour override. */
  cellColor?: (row: number, col: number, value: string) => RGB | undefined;
  /** Rows whose first cell matches are drawn as full-width group headers. */
  groupRow?: (row: string[]) => boolean;
}

/**
 * Draws a table that flows over as many pages as needed, repeating the header row on
 * every continuation page. Returns the number of body rows drawn.
 */
export function drawTable(ctx: ReportCtx, opts: TableOptions): number {
  const fontSize = opts.fontSize ?? 7;
  const rowH = opts.rowH ?? 5.4;
  const headH = 6;
  const totalRel = opts.columns.reduce((s, c) => s + c.width, 0);
  const widths = opts.columns.map(c => (c.width / totalRel) * ctx.contentW);
  const xs: number[] = [];
  let acc = M;
  widths.forEach(w => {
    xs.push(acc);
    acc += w;
  });

  const cellX = (i: number): number => {
    const a = opts.columns[i].align ?? 'left';
    if (a === 'right') return xs[i] + widths[i] - 1.8;
    if (a === 'center') return xs[i] + widths[i] / 2;
    return xs[i] + 1.8;
  };

  const drawHeader = (): void => {
    ctx.fill(COLORS.ink);
    ctx.doc.rect(M, ctx.y, ctx.contentW, headH, 'F');
    opts.columns.forEach((c, i) => {
      ctx.t(c.header, cellX(i), ctx.y + 4.1, {
        style: 'bold',
        size: Math.min(fontSize, 6.8),
        color: COLORS.white,
        align: c.align,
        maxW: widths[i] - 2.5
      });
    });
    ctx.y += headH;
  };

  ctx.ensureSpace(headH + rowH * 2 + 2);
  drawHeader();

  let drawn = 0;
  opts.rows.forEach((row, r) => {
    const keepWithTotals = opts.totals && r === opts.rows.length - 1 ? rowH + 0.6 : 0;
    if (ctx.y + rowH + keepWithTotals > ctx.bottom) {
      ctx.continuePage();
      drawHeader();
    }
    if (opts.groupRow && opts.groupRow(row)) {
      ctx.fill(COLORS.greyBg);
      ctx.doc.rect(M, ctx.y, ctx.contentW, rowH, 'F');
      ctx.t(row[0], M + 1.8, ctx.y + rowH * 0.7, { style: 'bold', size: fontSize, color: COLORS.ink, maxW: ctx.contentW - 4 });
      ctx.y += rowH;
      return;
    }
    ctx.fill(drawn % 2 === 1 ? COLORS.zebra : COLORS.white);
    ctx.doc.rect(M, ctx.y, ctx.contentW, rowH, 'F');
    opts.columns.forEach((c, i) => {
      const v = row[i] ?? '';
      const color = opts.cellColor?.(r, i, v) ?? c.color ?? COLORS.body;
      ctx.t(v, cellX(i), ctx.y + rowH * 0.7, {
        style: c.bold ? 'bold' : 'normal',
        size: fontSize,
        color,
        align: c.align,
        maxW: widths[i] - 2.5
      });
    });
    ctx.y += rowH;
    drawn++;
  });

  if (opts.totals) {
    const h = rowH + 0.6;
    if (ctx.y + h > ctx.bottom) {
      ctx.continuePage();
      drawHeader();
    }
    ctx.fill([241, 245, 249]);
    ctx.doc.rect(M, ctx.y, ctx.contentW, h, 'F');
    ctx.stroke(COLORS.border, 0.4);
    ctx.doc.line(M, ctx.y, M + ctx.contentW, ctx.y);
    ctx.doc.line(M, ctx.y + h, M + ctx.contentW, ctx.y + h);
    opts.columns.forEach((c, i) => {
      const v = opts.totals![i] ?? '';
      if (!v) return;
      ctx.t(v, cellX(i), ctx.y + h * 0.7, {
        style: 'bold',
        size: fontSize,
        color: COLORS.ink,
        align: c.align,
        maxW: widths[i] - 2.5
      });
    });
    ctx.y += h;
  }

  ctx.y += 5;
  return drawn;
}
