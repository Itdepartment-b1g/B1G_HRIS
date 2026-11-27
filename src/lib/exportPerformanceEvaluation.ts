import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

const PURPLE = 'FF472160';
const PURPLE_RGB: [number, number, number] = [71, 33, 96];
const LOGO_URL = '/B1G_LOGO_COLORED.png';

export interface EvaluationFactorExport {
  title: string;
  description: string;
  rating: string;
  comment: string;
}

export interface EvaluationSectionExport {
  title: string;
  body: string;
}

export interface EvaluationSignatureExport {
  title: string;
  name: string;
  when: string;
  image: string | null;
  imageWidth?: number;
  imageHeight?: number;
  note: string;
}

export interface EvaluationSheetExport {
  formName: string;
  periodLabel: string;
  fullName: string;
  position: string;
  department: string;
  employmentStatus: string;
  employeeCode: string;
  dateHired: string;
  evaluatorName: string;
  periodFrom: string;
  periodTo: string;
  dateOfEvaluation: string;
  scaleLine: string;
  factors: EvaluationFactorExport[];
  averageScore: string;
  overallRating: string;
  sections: EvaluationSectionExport[];
  recommendation: string;
  signatures: EvaluationSignatureExport[];
  filenameBase: string;
}

const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function fileBase(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.slice(0, 80) || 'evaluation';
}

function pngBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** The logo file is purple on black. Clear the black so it sits on the white form. */
function clearBlackBackground(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = image.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 28 && pixels[i + 1] < 28 && pixels[i + 2] < 28) pixels[i + 3] = 0;
      }
      ctx.putImageData(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return dataUrl ? clearBlackBackground(dataUrl) : null;
  } catch {
    return null;
  }
}

async function loadCompanyName(): Promise<string> {
  const { data } = await supabase.from('company_profile').select('name').limit(1).maybeSingle();
  const name = data && typeof data.name === 'string' ? data.name.trim() : '';
  return name || 'B1G Corporation';
}

function saveBlob(buffer: BlobPart, filename: string, type: string) {
  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** The logo already reads B1G, so the word beside it is only the rest of the company name. */
function companySuffix(name: string): string {
  const rest = name.trim().replace(/^b1g\b\s*/i, '').trim();
  return (rest || name.trim() || 'Corporation').toUpperCase();
}

function factorText(factor: EvaluationFactorExport): string {
  return factor.description.trim() ? `${factor.title}\n${factor.description.trim()}` : factor.title;
}

function wrappedLineCount(text: string, charsPerLine: number): number {
  return text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine)), 0);
}

/** Cut the blank canvas around a signature so the pen stroke can sit in the middle of the box. */
function cropSignature(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const i = (y * canvas.width + x) * 4;
          const ink = pixels[i + 3] > 16 && (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245);
          if (!ink) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX <= minX || maxY <= minY) {
        resolve(null);
        return;
      }
      const pad = 10;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(canvas.width - 1, maxX + pad);
      maxY = Math.min(canvas.height - 1, maxY + pad);
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const outCtx = out.getContext('2d');
      if (!outCtx) {
        resolve(null);
        return;
      }
      outCtx.fillStyle = '#ffffff';
      outCtx.fillRect(0, 0, width, height);
      outCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
      resolve({ dataUrl: out.toDataURL('image/png'), width, height });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function withCenteredSignatures(sheet: EvaluationSheetExport): Promise<EvaluationSheetExport> {
  const signatures = await Promise.all(sheet.signatures.map(async (sig) => {
    if (!sig.image) return sig;
    const cropped = await cropSignature(sig.image);
    if (!cropped) return sig;
    return { ...sig, image: cropped.dataUrl, imageWidth: cropped.width, imageHeight: cropped.height };
  }));
  return { ...sheet, signatures };
}

export async function downloadEvaluationSheet(format: 'pdf' | 'xlsx', sheet: EvaluationSheetExport): Promise<void> {
  const [logo, companyName, prepared] = await Promise.all([loadLogo(), loadCompanyName(), withCenteredSignatures(sheet)]);
  const filename = `${fileBase(prepared.filenameBase)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
  if (format === 'pdf') {
    const doc = buildPdf(prepared, companyName, logo);
    doc.save(filename);
    return;
  }
  const buffer = await buildXlsx(prepared, companyName, logo);
  saveBlob(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function buildPdf(sheet: EvaluationSheetExport, companyName: string, logo: string | null): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const width = pageW - margin * 2;
  let y = 6;

  const ensure = (height: number) => {
    if (y + height <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  const sectionBar = (title: string) => {
    ensure(8);
    doc.setFillColor(...PURPLE_RGB);
    doc.rect(margin, y, width, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), margin + 2, y + 4.8);
    doc.setTextColor(0, 0, 0);
    y += 7;
  };

  const logoW = 26;
  const logoH = 10;
  if (logo) doc.addImage(logo, 'PNG', margin, y, logoW, logoH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PURPLE_RGB);
  doc.text(companySuffix(companyName), margin + (logo ? logoW + 1.5 : 0), y + 7);
  y += 12;
  doc.setFontSize(11);
  if (sheet.formName.trim()) {
    doc.text(sheet.formName.trim(), pageW / 2, y, { align: 'center' });
    y += 4.5;
  }
  if (sheet.periodLabel.trim()) {
    doc.setFontSize(10);
    doc.text(sheet.periodLabel.trim(), pageW / 2, y, { align: 'center' });
    y += 4.5;
  }
  doc.setTextColor(0, 0, 0);

  doc.setFillColor(...PURPLE_RGB);
  doc.rect(margin, y, width, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EMPLOYEE EVALUATION FORM', pageW / 2, y + 4.8, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 8;

  const info: [string, string, string, string][] = [
    ['Full Name', sheet.fullName, 'Evaluation Period', `From ${sheet.periodFrom}    To ${sheet.periodTo}`],
    ['Position', sheet.position, 'Date of Evaluation', sheet.dateOfEvaluation],
    ['Department', sheet.department, 'Date Hired', sheet.dateHired],
    ["Evaluator's Name", sheet.evaluatorName, 'Employee Code', sheet.employeeCode],
  ];
  const half = width / 2;
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    ensure(7);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, half, 6.5);
    doc.rect(margin + half, y, half, 6.5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(leftLabel, margin + 1.5, y + 4.3);
    doc.text(rightLabel, margin + half + 1.5, y + 4.3);
    const leftLabelW = doc.getTextWidth(leftLabel) + 2;
    const rightLabelW = doc.getTextWidth(rightLabel) + 2;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(leftValue || '—', half - leftLabelW - 4)[0] ?? '—', margin + 1.5 + leftLabelW, y + 4.3);
    doc.text(doc.splitTextToSize(rightValue || '—', half - rightLabelW - 4)[0] ?? '—', margin + half + 1.5 + rightLabelW, y + 4.3);
    y += 6.5;
  });
  y += 2;

  sectionBar('Performance factors');
  ensure(8);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  const scaleLines = doc.splitTextToSize(sheet.scaleLine, width - 4);
  doc.text(scaleLines, margin + 2, y + 4);
  y += scaleLines.length * 4 + 2;

  autoTable(doc, {
    startY: y,
    head: [['Factor', 'Rating', 'Comment']],
    body: sheet.factors.map((factor) => [factorText(factor), factor.rating || '—', factor.comment || '—']),
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 1.5, valign: 'middle', textColor: 20, lineColor: 0, lineWidth: 0.2 },
    headStyles: { fillColor: PURPLE_RGB, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { cellWidth: 32, halign: 'center' },
      2: { cellWidth: width - 120 },
    },
    theme: 'grid',
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

  ensure(7);
  doc.setDrawColor(0);
  doc.rect(margin, y, width, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Average score', margin + 2, y + 4.6);
  doc.setFont('helvetica', 'normal');
  doc.text(sheet.averageScore || '—', margin + 32, y + 4.6);
  doc.setFont('helvetica', 'bold');
  doc.text('Overall rating', margin + half, y + 4.6);
  doc.setFont('helvetica', 'normal');
  doc.text(sheet.overallRating || '—', margin + half + 32, y + 4.6);
  y += 9;

  const drawSectionBox = (x: number, boxW: number, title: string, body: string, headH: number, boxH: number) => {
    doc.setFillColor(...PURPLE_RGB);
    doc.rect(x, y, boxW, headH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const titleLines = doc.splitTextToSize(title, boxW - 4);
    doc.text(titleLines, x + 2, y + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(body || '—', boxW - 4);
    doc.setDrawColor(0);
    doc.rect(x, y + headH, boxW, boxH);
    doc.text(lines, x + 2, y + headH + 5);
  };

  for (let i = 0; i < sheet.sections.length; i += 2) {
    const left = sheet.sections[i];
    const right = sheet.sections[i + 1];
    const boxW = right ? half - 1 : width;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const leftTitle = doc.splitTextToSize(left.title, boxW - 4);
    const rightTitle = right ? doc.splitTextToSize(right.title, boxW - 4) : [];
    const headH = Math.max(7, Math.max(leftTitle.length, rightTitle.length) * 3.4 + 2);
    doc.setFont('helvetica', 'normal');
    const leftLines = doc.splitTextToSize(left.body || '—', boxW - 4);
    const rightLines = right ? doc.splitTextToSize(right.body || '—', boxW - 4) : [];
    const boxH = Math.min(18, Math.max(12, Math.max(leftLines.length, rightLines.length) * 3.6 + 3));
    ensure(headH + boxH + 4);
    drawSectionBox(margin, boxW, left.title, left.body, headH, boxH);
    if (right) drawSectionBox(margin + half + 1, boxW, right.title, right.body, headH, boxH);
    y += headH + boxH + 4;
  }

  if (sheet.recommendation) {
    ensure(16);
    sectionBar('Recommendation');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(sheet.recommendation, width - 4);
    doc.text(lines, margin + 2, y + 5);
    y += lines.length * 4 + 4;
  }

  const sigW = width / 3;
  const sigBlockH = 34;
  ensure(sigBlockH);
  sheet.signatures.forEach((sig, index) => {
    const x = margin + index * sigW;
    const boxW = sigW - 2;
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.rect(x, y, boxW, sigBlockH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...PURPLE_RGB);
    const title = doc.splitTextToSize(sig.title.toUpperCase(), boxW - 4)[0] ?? '';
    doc.text(title, x + boxW / 2, y + 4.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    const maxW = boxW - 10;
    const maxH = 13;
    const aspect = sig.imageWidth && sig.imageHeight ? sig.imageWidth / sig.imageHeight : 3;
    let imgW = maxW;
    let imgH = imgW / aspect;
    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH * aspect;
    }
    const imgX = x + (boxW - imgW) / 2;
    const imgY = y + 6 + (maxH - imgH) / 2;
    if (sig.image) doc.addImage(sig.image, 'PNG', imgX, imgY, imgW, imgH);
    doc.setFontSize(8);
    doc.text(sig.name || ' ', x + boxW / 2, y + 24, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(sig.when || 'Pending', x + boxW / 2, y + 28.5, { align: 'center' });
    if (sig.note) doc.text(doc.splitTextToSize(sig.note, boxW - 6)[0] ?? '', x + boxW / 2, y + 32, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  });

  return doc;
}

async function buildXlsx(sheet: EvaluationSheetExport, companyName: string, logo: string | null): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Evaluation', {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 24 },
    { width: 20 },
    { width: 22 },
    { width: 24 },
    { width: 18 },
    { width: 26 },
  ];

  const paint = (row: number, col: number, value: string, opts?: { bold?: boolean; size?: number; color?: string; fill?: string; align?: 'left' | 'center' | 'right'; italic?: boolean; wrap?: boolean; vertical?: 'middle' | 'top' }) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = {
      name: 'Calibri',
      size: opts?.size ?? 11,
      bold: opts?.bold,
      italic: opts?.italic,
      color: { argb: opts?.color ?? 'FF000000' },
    };
    cell.alignment = { vertical: opts?.vertical ?? 'middle', horizontal: opts?.align ?? 'left', wrapText: opts?.wrap ?? true };
    cell.border = border;
    if (opts?.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    return cell;
  };

  const merge = (row: number, c1: number, c2: number, value: string, opts?: Parameters<typeof paint>[3]) => {
    ws.mergeCells(row, c1, row, c2);
    paint(row, c1, value, opts);
    for (let c = c1; c <= c2; c += 1) {
      const cell = ws.getCell(row, c);
      cell.border = border;
      if (opts?.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    }
  };

  ws.getRow(1).height = 26;
  ws.getRow(2).height = 20;
  if (logo) {
    const logoId = workbook.addImage({ base64: pngBase64(logo), extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.05, row: 0.12 }, ext: { width: 88, height: 24 }, editAs: 'oneCell' });
  }
  merge(1, 2, 3, companySuffix(companyName), { bold: true, size: 16, color: PURPLE, align: 'left', wrap: false });
  for (let c = 2; c <= 3; c += 1) ws.getCell(1, c).border = {};
  merge(2, 1, 6, sheet.formName.trim(), { bold: true, size: 14, align: 'center', color: PURPLE, wrap: false });
  for (let c = 1; c <= 6; c += 1) ws.getCell(2, c).border = {};
  ws.getRow(3).height = 18;
  merge(3, 1, 6, sheet.periodLabel.trim(), { bold: true, size: 12, align: 'center', wrap: false });
  for (let c = 1; c <= 6; c += 1) ws.getCell(3, c).border = {};

  merge(4, 1, 6, 'EMPLOYEE EVALUATION FORM', { bold: true, size: 14, color: 'FFFFFFFF', fill: PURPLE, align: 'center', wrap: false });
  ws.getRow(4).height = 24;

  const info: [string, string, string, string][] = [
    ['Full Name', sheet.fullName, 'Evaluation Period', `From ${sheet.periodFrom}    To ${sheet.periodTo}`],
    ['Position', sheet.position, 'Date of Evaluation', sheet.dateOfEvaluation],
    ['Department', sheet.department, 'Date Hired', sheet.dateHired],
    ["Evaluator's Name", sheet.evaluatorName, 'Employee Code', sheet.employeeCode],
  ];
  info.forEach((row, index) => {
    const r = 5 + index;
    ws.getRow(r).height = 22;
    paint(r, 1, row[0], { bold: true, size: 11, wrap: false });
    merge(r, 2, 3, row[1] || '—', { size: 11, wrap: false });
    paint(r, 4, row[2], { bold: true, size: 11, wrap: false });
    merge(r, 5, 6, row[3] || '—', { size: 11, wrap: false });
  });

  let r = 10;
  merge(r, 1, 6, 'PERFORMANCE FACTORS', { bold: true, size: 12, color: 'FFFFFFFF', fill: PURPLE });
  ws.getRow(r).height = 20;
  r += 1;
  merge(r, 1, 6, sheet.scaleLine, { italic: true, size: 10 });
  ws.getRow(r).height = 18;
  r += 1;
  merge(r, 1, 3, 'Factor', { bold: true, size: 11, color: 'FFFFFFFF', fill: PURPLE, align: 'center' });
  paint(r, 4, 'Rating', { bold: true, size: 11, color: 'FFFFFFFF', fill: PURPLE, align: 'center' });
  merge(r, 5, 6, 'Comment', { bold: true, size: 11, color: 'FFFFFFFF', fill: PURPLE, align: 'center' });
  ws.getRow(r).height = 18;
  r += 1;

  sheet.factors.forEach((factor) => {
    const text = factorText(factor);
    const lines = wrappedLineCount(text, 42);
    ws.getRow(r).height = Math.max(34, lines * 16 + 6);
    merge(r, 1, 3, text, { size: 11, vertical: 'top' });
    paint(r, 4, factor.rating || '—', { size: 11, align: 'center' });
    merge(r, 5, 6, factor.comment || '—', { size: 11, vertical: 'top' });
    r += 1;
  });

  r += 1;
  paint(r, 1, 'Average score', { bold: true, size: 10 });
  merge(r, 2, 3, sheet.averageScore || '—', { bold: true, size: 12, align: 'center' });
  paint(r, 4, 'Overall rating', { bold: true, size: 10 });
  merge(r, 5, 6, sheet.overallRating || '—', { bold: true, size: 12 });
  ws.getRow(r).height = 22;
  r += 2;

  for (let i = 0; i < sheet.sections.length; i += 2) {
    const left = sheet.sections[i];
    const right = sheet.sections[i + 1];
    if (right) {
      merge(r, 1, 3, left.title, { bold: true, size: 10, color: 'FFFFFFFF', fill: PURPLE, align: 'center' });
      merge(r, 4, 6, right.title, { bold: true, size: 10, color: 'FFFFFFFF', fill: PURPLE, align: 'center' });
      ws.getRow(r).height = 20;
      r += 1;
      const bodyLines = Math.max(left.body.length, right.body.length);
      ws.getRow(r).height = Math.min(32, Math.max(22, Math.ceil(bodyLines / 50) * 12));
      merge(r, 1, 3, left.body || '—', { size: 10 });
      merge(r, 4, 6, right.body || '—', { size: 10 });
      r += 2;
    } else {
      merge(r, 1, 6, left.title, { bold: true, size: 11, color: 'FFFFFFFF', fill: PURPLE });
      ws.getRow(r).height = 18;
      r += 1;
      ws.getRow(r).height = Math.min(90, Math.max(40, Math.ceil(left.body.length / 80) * 16));
      merge(r, 1, 6, left.body || '—', { size: 10 });
      r += 2;
    }
  }

  if (sheet.recommendation) {
    merge(r, 1, 6, 'RECOMMENDATION', { bold: true, size: 11, color: 'FFFFFFFF', fill: PURPLE });
    ws.getRow(r).height = 18;
    r += 1;
    ws.getRow(r).height = 24;
    merge(r, 1, 6, sheet.recommendation, { size: 10 });
    r += 2;
  }

  const sigRow = r;
  ws.getRow(sigRow).height = 16;
  ws.getRow(sigRow + 1).height = 36;
  ws.getRow(sigRow + 2).height = 16;
  ws.getRow(sigRow + 3).height = 14;
  sheet.signatures.forEach((sig, index) => {
    const c = index * 2 + 1;
    merge(sigRow, c, c + 1, sig.title, { bold: true, size: 9, color: PURPLE, align: 'center' });
    merge(sigRow + 1, c, c + 1, '', { size: 10 });
    merge(sigRow + 2, c, c + 1, sig.name || ' ', { size: 10, align: 'center' });
    merge(sigRow + 3, c, c + 1, sig.when || 'Pending', { size: 9, align: 'center', color: 'FF666666' });
    if (sig.note) {
      ws.getRow(sigRow + 4).height = 16;
      merge(sigRow + 4, c, c + 1, sig.note, { size: 8, align: 'center', italic: true });
    }
    if (sig.image) {
      const imageId = workbook.addImage({ base64: pngBase64(sig.image), extension: 'png' });
      const w1 = Number(ws.getColumn(c).width) || 10;
      const w2 = Number(ws.getColumn(c + 1).width) || 10;
      const span = w1 + w2;
      const colPx = span * 7.5;
      const rowPx = 36 * (96 / 72);
      const aspect = sig.imageWidth && sig.imageHeight ? sig.imageWidth / sig.imageHeight : 3;
      let drawW = colPx * 0.62;
      let drawH = drawW / aspect;
      const maxH = rowPx * 0.72;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * aspect;
      }
      const padX = (colPx - drawW) / 2;
      const padY = (rowPx - drawH) / 2;
      const at = (units: number) => (units <= w1 ? (c - 1) + units / w1 : c + (units - w1) / w2);
      ws.addImage(imageId, {
        tl: { col: at(padX / 7.5), row: sigRow + padY / rowPx },
        ext: { width: drawW, height: drawH },
        editAs: 'oneCell',
      });
    }
  });

  const out = await workbook.xlsx.writeBuffer();
  return out as ArrayBuffer;
}
