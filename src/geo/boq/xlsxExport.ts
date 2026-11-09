/**
 * XLSX export of the BOQ: a "BOQ" sheet (grouped by farm with subtotals), a costed "BOM" sheet and
 * one "DUPA <item>" sheet per work item, mirroring the layout of the reference estimate workbook.
 *
 * Uses a small hand-rolled OOXML writer (zip via fflate) so no spreadsheet library is needed.
 * All values are written as plain numbers / strings (no formulas), so they read the same in
 * Excel, LibreOffice and Google Sheets.
 */
import { zipSync, strToU8 } from 'fflate';
import { DupaWorkItem, ProjectBoqState } from '../../types/solar';
import { extractCostedBom } from './boqExport';
import { getBoqProjectTotal, getBoqSectionTotals } from './dupaMath';

type StyleName = 'default' | 'bold' | 'title' | 'header' | 'money' | 'moneyBold' | 'qty' | 'section' | 'percent';
type CellValue = string | number | null | { v: string | number | null; s: StyleName };
type Row = CellValue[];

interface SheetDef {
  name: string;
  rows: Row[];
  widths: number[]; // column widths in characters
}

// Style indices must match buildStylesXml() below.
const STYLE_INDEX: Record<StyleName, number> = {
  default: 0,
  bold: 1,
  title: 2,
  header: 3,
  money: 4,
  moneyBold: 5,
  qty: 6,
  section: 7,
  percent: 8
};

function colName(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Escapes XML text and drops characters XML 1.0 cannot represent. */
function xmlEscape(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellXml(ref: string, cell: CellValue): string {
  if (cell === null || cell === undefined) return '';
  const { v, s } = typeof cell === 'object' ? cell : { v: cell, s: 'default' as StyleName };
  if (v === null || v === '') {
    return s === 'default' ? '' : `<c r="${ref}" s="${STYLE_INDEX[s]}"/>`;
  }
  const style = STYLE_INDEX[s];
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
}

function sheetXml(sheet: SheetDef): string {
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((c, i) => cellXml(`${colName(i)}${r + 1}`, c)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`
  );
}

function buildStylesXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.##"/></numFmts>` +
    `<fonts count="3">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="9">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ], unique (case-insensitive). */
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

const H = (text: string): CellValue => ({ v: text, s: 'header' });
const B = (text: string | number): CellValue => ({ v: text, s: 'bold' });
const M = (n: number): CellValue => ({ v: n, s: 'money' });
const MB = (n: number): CellValue => ({ v: n, s: 'moneyBold' });
const Q = (n: number): CellValue => ({ v: n, s: 'qty' });

type SectionLookup = Map<string, { code: string; name: string }> | undefined;

function boqSheet(projectName: string, boq: ProjectBoqState, sections: SectionLookup): SheetDef {
  const totals = getBoqProjectTotal(boq);
  const hasSections = boq.items.some(i => i.sectionId);
  const rows: Row[] = [
    [{ v: 'BILL OF QUANTITIES (BOQ)', s: 'title' }],
    [`Project: ${projectName}`],
    [`Export Date: ${new Date().toLocaleDateString('en-US')}`],
    [],
    ['Item No.', 'Category', 'Work Description', 'Quantity', 'Unit', 'Unit Cost (PHP)', 'Total Cost (PHP)'].map(H)
  ];

  for (const group of getBoqSectionTotals(boq)) {
    const sec = group.sectionId ? sections?.get(group.sectionId) : undefined;
    if (hasSections) {
      rows.push([{ v: sec ? `${sec.code} — ${sec.name}` : 'Other Systems', s: 'section' }, { v: null, s: 'section' }, { v: null, s: 'section' }]);
    }
    for (const it of group.items) {
      rows.push([it.itemNo, it.category, it.description, Q(it.quantity), it.unit, M(it.unitCostPerItemPhp), M(it.totalItemCostPhp)]);
    }
    if (hasSections) {
      rows.push([null, null, B(`Subtotal${sec ? ` (${sec.code})` : ''}`), null, null, null, MB(group.total)]);
    }
  }
  rows.push([null, null, B('GRAND TOTAL PROJECT ESTIMATE'), null, null, null, MB(totals.grandTotal)]);
  return { name: 'BOQ', rows, widths: [10, 22, 70, 12, 8, 18, 20] };
}

function bomSheet(projectName: string, boq: ProjectBoqState): SheetDef {
  const bom = extractCostedBom(boq);
  const total = bom.reduce((s, i) => s + i.amountPhp, 0);
  const rows: Row[] = [
    [{ v: 'COSTED BILL OF MATERIALS (BOM)', s: 'title' }],
    [`Project: ${projectName}`],
    [],
    ['Item Tag', 'Category', 'Material Description', 'DUPA Source', 'Quantity', 'Unit', 'Unit Cost (PHP)', '% of Materials', 'Total Amount (PHP)'].map(H)
  ];
  for (const it of bom) {
    rows.push([
      it.itemNo, it.category, it.description, `${it.dupaItemNo} - ${it.dupaWorkDescription}`,
      Q(it.quantity), it.unit, M(it.unitCostPhp), { v: total > 0 ? it.amountPhp / total : 0, s: 'percent' }, M(it.amountPhp)
    ]);
  }
  rows.push([null, null, B('TOTAL MATERIALS'), null, null, null, null, null, MB(Number(total.toFixed(2)))]);
  return { name: 'BOM', rows, widths: [10, 34, 60, 50, 12, 8, 18, 14, 20] };
}

function dupaSheet(name: string, it: DupaWorkItem): SheetDef {
  const rows: Row[] = [
    [{ v: 'DETAILED UNIT PRICE ANALYSIS (DUPA)', s: 'title' }],
    [],
    [B('Item No.'), it.itemNo, B('Duration'), `${it.durationDays} days`],
    [B('Category'), it.category, B('Quantity'), Q(it.quantity)],
    [B('Description'), it.description, B('Unit'), it.unit],
    [],
    [B('A. MATERIALS')],
    ['Description', 'Quantity', 'Unit', 'Unit Cost (PHP)', 'Amount (PHP)'].map(H)
  ];
  for (const m of it.materials) rows.push([m.description, Q(m.quantity), m.unit, M(m.unitCostPhp), M(m.amountPhp)]);
  rows.push([B('Total Materials (A)'), null, null, null, MB(it.totalMaterialsPhp)], []);

  rows.push([B('B. LABOR')], ['Description', 'No.', 'Days', 'Unit', 'Rate/Day (PHP)', 'Amount (PHP)'].map(H));
  for (const l of it.labor) rows.push([l.description, Q(l.count), Q(l.days), l.unit, M(l.ratePerDayPhp), M(l.amountPhp)]);
  rows.push([B('Total Labor (B)'), null, null, null, null, MB(it.totalLaborPhp)], []);

  rows.push([B('C. EQUIPMENT')], ['Description', 'No.', 'Days', 'Unit', 'Rate/Day (PHP)', 'Amount (PHP)'].map(H));
  for (const e of it.equipment) rows.push([e.description, Q(e.count), Q(e.days), e.unit, M(e.ratePerDayPhp), M(e.amountPhp)]);
  rows.push([B('Total Equipment (C)'), null, null, null, null, MB(it.totalEquipmentPhp)], []);

  rows.push(
    [B('SUMMARY')],
    ['Estimated Direct Cost (EDC = A+B+C)', null, null, null, null, M(it.estimatedDirectCostPhp)],
    [`OCM (${it.ocmPercent.toFixed(2)}%)`, null, null, null, null, M(it.ocmAmountPhp)],
    [`Contractor's Profit (${it.profitPercent.toFixed(2)}%)`, null, null, null, null, M(it.profitAmountPhp)],
    [`Value Added Tax (${it.vatPercent.toFixed(2)}%)`, null, null, null, null, M(it.vatAmountPhp)],
    [B('TOTAL ITEM COST'), null, null, null, null, MB(it.totalItemCostPhp)],
    [B('UNIT COST PER ITEM'), null, null, null, null, MB(it.unitCostPerItemPhp)]
  );
  return { name, rows, widths: [62, 14, 12, 16, 18, 18] };
}

/** Builds the workbook and returns the .xlsx file bytes. */
export function buildBoqXlsx(projectName: string, boq: ProjectBoqState, sections?: SectionLookup): Uint8Array {
  const used = new Set<string>();
  const sheets: SheetDef[] = [boqSheet(projectName, boq, sections), bomSheet(projectName, boq)];
  sheets.forEach(s => used.add(s.name.toLowerCase()));
  for (const it of boq.items) {
    sheets.push(dupaSheet(uniqueSheetName(`DUPA ${it.itemNo}`, used), it));
  }

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('') +
        `</Types>`
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        `</workbook>`
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`
    ),
    'xl/styles.xml': strToU8(buildStylesXml())
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}
