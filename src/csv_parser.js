const fs = require('fs');

/**
 * Fast, memory-efficient RFC-4180 compliant CSV parser.
 */
function parseCSVText(text) {
  const rows = [];
  let headers = null;
  let row = [];
  let field = '';
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < len && text[i + 1] === '\n') {
          i++;
        }
        row.push(field);
        field = '';
        if (!headers) {
          headers = row.map(h => h.trim().replace(/^\uFEFF/, ''));
        } else if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          const obj = {};
          for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = row[j] !== undefined ? row[j] : '';
          }
          rows.push(obj);
        }
        row = [];
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (headers && (row.length > 1 || (row.length === 1 && row[0] !== ''))) {
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j] !== undefined ? row[j] : '';
      }
      rows.push(obj);
    }
  }

  return rows;
}

function parseCSVFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  return parseCSVText(text);
}

module.exports = { parseCSVText, parseCSVFile };
