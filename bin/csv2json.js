#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const VERSION = '1.0.0';

// ─── ANSI ─────────────────────────────────────────────────────────────────────
const isTTY  = process.stderr.isTTY;
const c      = (code, t) => isTTY ? `\x1b[${code}m${t}\x1b[0m` : t;
const bold   = t => c('1',  t);
const dim    = t => c('2',  t);
const red    = t => c('31', t);
const green  = t => c('32', t);
const yellow = t => c('33', t);
const cyan   = t => c('36', t);

// ─── CSV parser (RFC 4180, quoted fields, escaped quotes, CRLF) ───────────────
function parseCSV(content, delimiter) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i], next = content[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            { inQuotes = false; }
      else                            { field += ch; }
    } else {
      if (ch === '"')                 { inQuotes = true; }
      else if (ch === delimiter)      { row.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop a trailing empty row produced by a final newline
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function detectDelimiter(firstLine) {
  const counts = {
    ',':  (firstLine.match(/,/g)  || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    ';':  (firstLine.match(/;/g)  || []).length,
    '|':  (firstLine.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0] || ',';
}

// ─── Value coercion ───────────────────────────────────────────────────────────
function coerce(val, opts) {
  if (opts.noType) return val;
  if (val === '') return opts.emptyAsNull ? null : '';
  const t = val.trim();
  if (t === '') return val;
  if (/^-?\d+$/.test(t))                     return parseInt(t, 10);
  if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
  if (/^-?\d+\.\d+$/.test(t))                return parseFloat(t);
  const low = t.toLowerCase();
  if (low === 'true')  return true;
  if (low === 'false') return false;
  if (low === 'null')  return null;
  return val;
}

// ─── CSV → JSON ───────────────────────────────────────────────────────────────
function csvToJson(content, opts) {
  const delimiter = opts.delimiter || detectDelimiter(content.split('\n')[0]);
  const rows = parseCSV(content, delimiter);
  if (!rows.length) return [];

  if (opts.noHeader) {
    return rows.map(r => r.map(v => coerce(v, opts)));
  }

  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj = {};
    headers.forEach((h, j) => {
      if (opts.skipEmpty && (r[j] === undefined || r[j] === '')) return;
      obj[h] = coerce(r[j] !== undefined ? r[j] : '', opts);
    });
    out.push(obj);
  }
  return out;
}

// ─── JSON → CSV ───────────────────────────────────────────────────────────────
function jsonToCsv(data, opts) {
  const delimiter = opts.delimiter || ',';
  let rows;

  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === 'object') rows = [data];
  else throw new Error('JSON must be an array of objects (or a single object)');

  if (!rows.length) return '';

  // Collect the union of all keys, preserving first-seen order
  const allArrays = rows.every(r => Array.isArray(r));
  if (allArrays) {
    return rows.map(r => r.map(v => csvCell(v, delimiter)).join(delimiter)).join('\n') + '\n';
  }

  const headers = [];
  const seen = new Set();
  for (const r of rows) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); headers.push(k); }
    }
  }

  const lines = [];
  if (!opts.noHeader) lines.push(headers.map(h => csvCell(h, delimiter)).join(delimiter));
  for (const r of rows) {
    lines.push(headers.map(h => csvCell(r ? r[h] : undefined, delimiter)).join(delimiter));
  }
  return lines.join('\n') + '\n';
}

function csvCell(v, delimiter) {
  if (v === undefined || v === null) return '';
  let s;
  if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  // Quote if it contains delimiter, quote, or newline
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const VALUE_FLAGS  = new Set(['-d', '--delimiter', '-o', '--out']);

function getFlag(...names) {
  for (const f of names) { const i = args.indexOf(f); if (i !== -1) return args[i + 1]; }
  return null;
}
function hasFlag(...names) { return names.some(f => args.includes(f)); }

const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('-') && args[i] !== '-') { if (VALUE_FLAGS.has(args[i])) i++; }
  else positional.push(args[i]);
}

if (hasFlag('--version', '-v')) {
  console.log(`csv2json v${VERSION}`); process.exit(0);
}

if (hasFlag('--help', '-h') || !positional.length) {
  console.log(`
${bold('csv2json')} — Convert between CSV and JSON, both directions, zero deps

${bold('USAGE')}
  csv2json <file.csv>            Convert CSV → JSON  (auto-detected by extension)
  csv2json <file.json>           Convert JSON → CSV
  cat data.csv | csv2json -      Read from stdin (assumes CSV unless --from)

${bold('OPTIONS')}
  --from <csv|json>    Force input format (needed for stdin / odd extensions)
  -o, --out <file>     Write to a file (format inferred from its extension)
  -d, --delimiter <d>  CSV delimiter: , ; | or "tab" (default: auto-detect)
  --no-header          CSV has no header row → arrays of values
  --no-type            Don't coerce numbers/booleans/null (keep strings)
  --empty-as-null      Convert empty CSV cells to null instead of ""
  --skip-empty         Omit empty cells from JSON objects entirely
  --pretty             Pretty-print JSON output (default for TTY)
  --compact            Compact single-line JSON
  --version            Show version

${bold('EXAMPLES')}
  csv2json users.csv                       # → JSON on stdout
  csv2json users.csv -o users.json         # → JSON file
  csv2json users.json -o users.csv         # JSON → CSV
  csv2json data.tsv -d tab                 # Tab-separated input
  cat export.csv | csv2json - --compact    # From stdin, one-line JSON
`);
  process.exit(positional.length ? 0 : 1);
}

let delimiter = getFlag('-d', '--delimiter');
if (delimiter === 'tab') delimiter = '\t';
const outFile     = getFlag('-o', '--out');
const forceFrom   = getFlag('--from');
const noHeader    = hasFlag('--no-header');
const noType      = hasFlag('--no-type');
const emptyAsNull = hasFlag('--empty-as-null');
const skipEmpty   = hasFlag('--skip-empty');
const compact     = hasFlag('--compact');
const pretty      = hasFlag('--pretty') || (!compact && (isTTY || outFile));

// Read input
const inPath = positional[0];
let content, sourceName;
if (inPath === '-') {
  content = fs.readFileSync(0, 'utf8');  // stdin
  sourceName = '(stdin)';
} else {
  const full = path.resolve(inPath);
  if (!fs.existsSync(full)) { console.error(red(`File not found: ${full}`)); process.exit(1); }
  content = fs.readFileSync(full, 'utf8');
  sourceName = path.basename(inPath);
}

// Determine direction
let direction = forceFrom
  ? (forceFrom === 'json' ? 'json2csv' : 'csv2json')
  : null;
if (!direction) {
  if (outFile && /\.csv$/i.test(outFile)) direction = 'json2csv';
  else if (outFile && /\.json$/i.test(outFile)) direction = 'csv2json';
  else if (/\.json$/i.test(inPath || '')) direction = 'json2csv';
  else if (/\.(csv|tsv|txt)$/i.test(inPath || '')) direction = 'csv2json';
  else {
    // Sniff: starts with { or [ → JSON
    direction = /^\s*[[{]/.test(content) ? 'json2csv' : 'csv2json';
  }
}

const opts = { delimiter, noHeader, noType, emptyAsNull, skipEmpty };

let output;
try {
  if (direction === 'csv2json') {
    const json = csvToJson(content, opts);
    output = JSON.stringify(json, null, pretty ? 2 : 0);
  } else {
    const data = JSON.parse(content);
    output = jsonToCsv(data, opts);
  }
} catch (e) {
  console.error(red(`\nConversion failed: ${e.message}\n`)); process.exit(1);
}

if (outFile) {
  fs.writeFileSync(path.resolve(outFile), output.endsWith('\n') ? output : output + '\n');
  const arrow = direction === 'csv2json' ? 'CSV → JSON' : 'JSON → CSV';
  process.stderr.write(`${green('✓')} ${arrow}  ${dim(sourceName)} → ${cyan(outFile)}\n`);
} else {
  process.stdout.write(output.endsWith('\n') ? output : output + '\n');
}
