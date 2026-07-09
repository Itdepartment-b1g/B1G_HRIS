/**
 * Shared styled XLSX report layout — company header block + yellow table headers.
 * Used by Leave Report and Leave Balance Report exports.
 */

import XLSX from 'xlsx-js-style';

const YELLOW_HEADER_FILL = { fgColor: { rgb: 'FFFF00' } };
const HEADER_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

export interface CompanyProfileForExport {
  name: string;
  address?: string | null;
  phone?: string | null;
  mobile_number?: string | null;
}

export interface StyledXlsxExportOptions {
  profile: CompanyProfileForExport;
  reportTitle: string;
  sheetName: string;
  filename: string;
  headers: string[];
  dataRows: string[][];
  columnWidths?: number[];
  emptyMessage?: string;
  emptyMessageCol?: number;
  /** Leave Report: top-right. Leave Balance Report: centered below company header. */
  titlePlacement?: 'top-right' | 'centered';
}

function companyPhone(profile: CompanyProfileForExport): string {
  return profile.mobile_number || profile.phone || '';
}

function splitAddressLines(address: string | null | undefined): string[] {
  if (!address?.trim()) return [];
  const trimmed = address.trim();
  const zipSuffix = trimmed.match(/^(.*),\s*(\d{4})\s*$/);
  if (zipSuffix) {
    return [zipSuffix[1].trim(), zipSuffix[2]];
  }
  return [trimmed];
}

function logoCell(): XLSX.CellObject {
  return {
    v: 'B1G',
    t: 's',
    s: {
      font: { bold: true, italic: true, sz: 28, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
    },
  };
}

function companyTextCell(
  value: string,
  opts?: { bold?: boolean; sz?: number; wrap?: boolean }
): XLSX.CellObject {
  return {
    v: value,
    t: 's',
    s: {
      font: { bold: opts?.bold, sz: opts?.sz ?? 11, color: { rgb: '000000' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: opts?.wrap ?? false },
    },
  };
}

function titleCell(reportTitle: string, alignment: 'right' | 'center'): XLSX.CellObject {
  return {
    v: reportTitle,
    t: 's',
    s: {
      font: { bold: true, sz: 14, color: { rgb: '000000' } },
      alignment: {
        horizontal: alignment,
        vertical: alignment === 'center' ? 'center' : 'top',
        wrapText: false,
      },
    },
  };
}

function dataCell(value: string | number): XLSX.CellObject {
  return {
    v: value,
    t: typeof value === 'number' ? 'n' : 's',
    s: {
      font: { sz: 10, color: { rgb: '000000' } },
      alignment: { vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'D9D9D9' } },
        bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
        left: { style: 'thin', color: { rgb: 'D9D9D9' } },
        right: { style: 'thin', color: { rgb: 'D9D9D9' } },
      },
    },
  };
}

function styledHeaderCell(value: string): XLSX.CellObject {
  return {
    v: value,
    t: 's',
    s: {
      fill: YELLOW_HEADER_FILL,
      font: { bold: true, sz: 10 },
      border: HEADER_BORDER,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    },
  };
}

function defaultColumnWidths(colCount: number): XLSX.ColInfo[] {
  return Array.from({ length: colCount }, (_, i) => {
    if (i === 0) return { wch: 12 };
    if (i === 1) return { wch: 24 };
    return { wch: 14 };
  });
}

export function writeStyledXlsxReport(options: StyledXlsxExportOptions): void {
  const {
    profile,
    reportTitle,
    sheetName,
    filename,
    headers,
    dataRows,
    columnWidths,
    emptyMessage = 'No Records',
    emptyMessageCol = 1,
    titlePlacement = 'top-right',
  } = options;

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const colCount = headers.length;
  const companyColStart = 2;
  const companyColEnd = Math.max(companyColStart, Math.min(7, colCount - 1));
  const titleCol = colCount - 1;
  const centeredTitle = titlePlacement === 'centered';
  const titleRow = centeredTitle ? 5 : 0;
  const headerRow = centeredTitle ? 7 : 5;

  const setCell = (r: number, c: number, cell: XLSX.CellObject) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
  };

  const mergeRow = (r: number, cStart: number, cEnd: number) => {
    if (cEnd > cStart) merges.push({ s: { r, c: cStart }, e: { r, c: cEnd } });
  };

  merges.push({ s: { r: 0, c: 0 }, e: { r: 3, c: 1 } });
  setCell(0, 0, logoCell());

  mergeRow(0, companyColStart, companyColEnd);
  setCell(0, companyColStart, companyTextCell(profile.name || 'B1G Corporation', { bold: true, sz: 12 }));

  const addressLines = splitAddressLines(profile.address);
  if (addressLines[0]) {
    mergeRow(1, companyColStart, companyColEnd);
    setCell(1, companyColStart, companyTextCell(addressLines[0], { wrap: true }));
  }
  if (addressLines[1]) {
    mergeRow(2, companyColStart, companyColEnd);
    setCell(2, companyColStart, companyTextCell(addressLines[1]));
  }

  const phone = companyPhone(profile);
  if (phone) {
    mergeRow(4, companyColStart, companyColEnd);
    setCell(4, companyColStart, companyTextCell(`Phone: ${phone}`));
  }

  if (centeredTitle) {
    merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: colCount - 1 } });
    setCell(titleRow, 0, titleCell(reportTitle, 'center'));
  } else {
    setCell(titleRow, titleCol, titleCell(reportTitle, 'right'));
  }

  headers.forEach((header, col) => {
    setCell(headerRow, col, styledHeaderCell(header));
  });

  const dataStartRow = headerRow + 1;
  if (dataRows.length === 0) {
    setCell(dataStartRow, emptyMessageCol, dataCell(emptyMessage));
    const mergeEnd = Math.min(emptyMessageCol + 2, colCount - 1);
    if (mergeEnd > emptyMessageCol) {
      merges.push({ s: { r: dataStartRow, c: emptyMessageCol }, e: { r: dataStartRow, c: mergeEnd } });
    }
  } else {
    dataRows.forEach((row, rowIndex) => {
      row.forEach((value, col) => {
        setCell(dataStartRow + rowIndex, col, dataCell(value));
      });
    });
  }

  const lastRow = dataRows.length === 0 ? dataStartRow : dataStartRow + dataRows.length - 1;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: colCount - 1 } });
  ws['!merges'] = merges;
  ws['!cols'] = (columnWidths || defaultColumnWidths(colCount)).map((wch) => ({ wch }));
  ws['!rows'] = centeredTitle
    ? [{ hpt: 22 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 8 }, { hpt: 24 }, { hpt: 10 }, { hpt: 22 }]
    : [{ hpt: 22 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 8 }, { hpt: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
