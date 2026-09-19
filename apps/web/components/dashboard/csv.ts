/**
 * Client-side CSV of rows the user is already looking at. Cells that a
 * spreadsheet would execute (leading = + - @) are prefixed so an imported guest
 * or customer name can never run as a formula.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
