import { COLORS, M, ReportCtx, num, php } from '../context';
import { drawTable } from '../table';
import { svgToPngDataUri } from '../../chartRenderer';
import { renderSldReportSvg, SingleLineDiagramUI } from '../../../ui/sldView';
import { getSldDimensions } from '../../../ui/sld/sldWireframe';
import { SldSystemModel } from '../../../geo/sldModel';
import { extractCostedBom } from '../../../geo/boq/boqExport';
import { getBoqProjectTotal } from '../../../geo/boq/dupaMath';

/** Page orientation that best fits a diagram of this shape (tall diagrams get portrait pages). */
function sldIsLandscape(model: SldSystemModel): boolean {
  // getSldDimensions only reads the model; it never touches its `this`.
  const { totalSvgWidth, totalSvgHeight } = getSldDimensions.call(undefined as unknown as SingleLineDiagramUI, model);
  return totalSvgWidth / totalSvgHeight >= 1.05;
}

/** Single-line diagram: one page per system in scope, oriented to the diagram's shape. */
export async function renderSld(ctx: ReportCtx): Promise<void> {
  const systems = ctx.bundle.systems;
  const subtitle = 'String allocation, MPPT channels, protection devices and grid connection.';
  const firstLandscape = systems.length ? sldIsLandscape(systems[0].sldModel) : true;
  ctx.beginSection('sld', 'Single Line Diagram', { landscape: firstLandscape, subtitle });

  if (systems.length === 0) {
    ctx.paragraph('No solar systems defined.', { style: 'italic', color: COLORS.muted });
    return;
  }

  for (let i = 0; i < systems.length; i++) {
    const s = systems[i];
    if (i > 0) {
      ctx.newPage(sldIsLandscape(s.sldModel), { sheet: ctx.sheet, title: 'Single Line Diagram', chrome: true });
      ctx.t(`Single Line Diagram \u2014 ${s.system.name}`, M, 25, { style: 'bold', size: 11, color: COLORS.ink });
      ctx.y = 31;
    } else if (systems.length > 1) {
      ctx.t(s.system.name, M, ctx.y + 3, { style: 'bold', size: 9, color: COLORS.navy });
      ctx.y += 5;
    }

    const boxY = ctx.y;
    await ctx.image(
      async () => {
        if (typeof document === 'undefined') return null;
        const sld = renderSldReportSvg(ctx.store, s.system.id, 'paper');
        const scale = Math.min(2, 2800 / Math.max(sld.width, sld.height));
        const uri = await svgToPngDataUri(sld.svg, Math.round(sld.width * scale), Math.round(sld.height * scale));
        if (!uri.startsWith('data:image/png')) {
          throw new Error('the browser could not rasterize the diagram SVG');
        }
        return { uri, aspect: sld.width / sld.height };
      },
      M,
      boxY,
      ctx.contentW,
      ctx.bottom - boxY,
      'Single line diagram'
    );
  }
}

/** BOQ: cost summary, totals block, category breakdown and itemised material list. */
export function renderBoq(ctx: ReportCtx): void {
  const sysFilter = ctx.options.systemId === 'all' ? undefined : ctx.options.systemId;
  ctx.beginSection('boq', 'Bill of Quantities & Cost', {
    subtitle: 'Estimate built from DUPA work items (materials, labour, equipment) with OCM, profit and VAT.'
  });

  const boq = ctx.store.getBoqState(sysFilter);
  if (!boq || !boq.items || boq.items.length === 0) {
    ctx.paragraph('No BOQ items have been generated for this project.', { style: 'italic', color: COLORS.muted });
    return;
  }
  const tot = getBoqProjectTotal(boq);

  ctx.kpiTiles([
    { label: 'Direct cost', value: php(tot.totalDirectCost).replace('PHP ', ''), sub: 'PHP (materials + labour + equipment)' },
    { label: 'OCM + profit', value: php(tot.totalOcm + tot.totalProfit).replace('PHP ', ''), sub: `PHP (${boq.ocmPercent}% + ${boq.profitPercent}%)` },
    { label: `VAT ${boq.vatPercent}%`, value: php(tot.totalVat).replace('PHP ', ''), sub: 'PHP' },
    { label: 'Grand total', value: php(tot.grandTotal).replace('PHP ', ''), sub: 'PHP, all-in' }
  ]);

  ctx.subheading('Cost summary by work item');
  drawTable(ctx, {
    columns: [
      { header: 'No.', width: 1, bold: true, color: COLORS.navy },
      { header: 'Work item', width: 5 },
      { header: 'Qty', width: 1.1, align: 'right' },
      { header: 'Unit', width: 1 },
      { header: 'Direct cost', width: 2.2, align: 'right' },
      { header: 'OCM + profit', width: 2.2, align: 'right' },
      { header: 'VAT', width: 1.8, align: 'right' },
      { header: 'Total', width: 2.4, align: 'right', bold: true }
    ],
    rows: boq.items.map(it => [
      it.itemNo,
      it.description,
      num(it.quantity, it.quantity % 1 ? 2 : 0),
      it.unit,
      num(it.estimatedDirectCostPhp, 2),
      num(it.ocmAmountPhp + it.profitAmountPhp, 2),
      num(it.vatAmountPhp, 2),
      num(it.totalItemCostPhp, 2)
    ]),
    totals: ['', 'GRAND TOTAL (PHP)', '', '', num(tot.totalDirectCost, 2), num(tot.totalOcm + tot.totalProfit, 2), num(tot.totalVat, 2), num(tot.grandTotal, 2)],
    fontSize: 6.6,
    rowH: 5.4
  });

  ctx.kvCardsRow(
    {
      title: 'Direct cost composition',
      rows: [
        ['Materials', php(tot.totalMaterials)],
        ['Labour', php(tot.totalLabor)],
        ['Equipment', php(tot.totalEquipment)],
        ['Total direct cost', php(tot.totalDirectCost)]
      ]
    },
    {
      title: 'Mark-ups & taxes',
      rows: [
        [`OCM (${boq.ocmPercent}%)`, php(tot.totalOcm)],
        [`Profit (${boq.profitPercent}%)`, php(tot.totalProfit)],
        [`VAT (${boq.vatPercent}%)`, php(tot.totalVat)],
        ['Grand total', php(tot.grandTotal)]
      ]
    }
  );

  const bom = extractCostedBom(boq);
  if (bom.length === 0) return;

  const byCat = new Map<string, number>();
  for (const b of bom) byCat.set(b.category, (byCat.get(b.category) ?? 0) + b.amountPhp);
  const matTotal = Array.from(byCat.values()).reduce((a, b) => a + b, 0);

  ctx.subheading('Material cost by category');
  drawTable(ctx, {
    columns: [
      { header: 'Category', width: 6 },
      { header: 'Amount (PHP)', width: 2.6, align: 'right', bold: true },
      { header: 'Share', width: 1.4, align: 'right' }
    ],
    rows: Array.from(byCat.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => [cat, num(amt, 2), matTotal > 0 ? `${((amt / matTotal) * 100).toFixed(1)} %` : '—']),
    totals: ['Total materials', num(matTotal, 2), '100 %'],
    fontSize: 7
  });

  ctx.subheading('Itemised material list');
  const rows: string[][] = [];
  let lastCat = '';
  const ordered = [...bom].sort((a, b) => a.dupaItemNo.localeCompare(b.dupaItemNo, undefined, { numeric: true }));
  for (const b of ordered) {
    const cat = `${b.dupaItemNo} — ${b.category}`;
    if (cat !== lastCat) {
      rows.push([cat, '', '', '', '', '']);
      lastCat = cat;
    }
    rows.push([b.itemNo, b.description, num(b.quantity, b.quantity % 1 ? 2 : 0), b.unit, num(b.unitCostPhp, 2), num(b.amountPhp, 2)]);
  }
  drawTable(ctx, {
    columns: [
      { header: 'Item', width: 1.2, bold: true, color: COLORS.navy },
      { header: 'Description', width: 6 },
      { header: 'Qty', width: 1.2, align: 'right' },
      { header: 'Unit', width: 1 },
      { header: 'Unit cost', width: 2, align: 'right' },
      { header: 'Amount', width: 2.4, align: 'right', bold: true }
    ],
    rows,
    groupRow: r => r[1] === '' && r[2] === '' && r[5] === '',
    fontSize: 6.6,
    rowH: 5
  });
}
