function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** columns: [{ key, label }]. rows: array of plain objects (dot-path keys supported, e.g. "a.b"). */
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = c.key.split('.').reduce((obj, part) => obj?.[part], row);
        return escapeCsvField(c.get ? c.get(row) : value);
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

export function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
