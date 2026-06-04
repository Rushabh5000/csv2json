# csv2json

Convert between CSV and JSON in **both directions**, with automatic type inference and a proper RFC 4180 parser (quoted fields, escaped quotes, embedded newlines). Zero dependencies.

The companion to [`csv-peek`](https://github.com/Rushabh5000/csv-peek) (which previews CSVs). Unlike `csvkit` (Python) or paste-it-here websites, this runs locally and never uploads your data.

---

## Install

```bash
npm install -g csv2json
```

Or without installing:

```bash
npx csv2json data.csv
```

---

## Usage

```bash
csv2json users.csv                    # CSV → JSON on stdout
csv2json users.csv -o users.json      # CSV → JSON file
csv2json users.json -o users.csv      # JSON → CSV
csv2json data.tsv -d tab              # Tab-separated input
cat export.csv | csv2json - --compact # From stdin, single-line JSON
```

Direction is inferred from the file extension (or the `-o` target), and falls back to sniffing the content. Force it with `--from csv|json`.

---

## Example

`users.csv`:
```csv
id,name,active,score
1,Alice,true,9.5
2,Bob,false,7
```

`csv2json users.csv`:
```json
[
  { "id": 1, "name": "Alice", "active": true, "score": 9.5 },
  { "id": 2, "name": "Bob", "active": false, "score": 7 }
]
```

Note that `1`→number, `true`→boolean, `9.5`→float automatically. Disable with `--no-type`.

Reverse it — `csv2json users.json -o users.csv` — and you get the CSV back.

---

## Type Inference

| CSV value | JSON value |
|---|---|
| `42` | `42` (number) |
| `3.14` | `3.14` (number) |
| `true` / `false` | boolean |
| `null` | `null` |
| empty cell | `""` (or `null` with `--empty-as-null`) |
| anything else | string |

Turn it off with `--no-type` to keep every value a string.

---

## Options

| Flag | Description |
|---|---|
| `--from <csv\|json>` | Force input format (for stdin / odd extensions) |
| `-o, --out <file>` | Write to a file (format from its extension) |
| `-d, --delimiter <d>` | `,` `;` `\|` or `tab` (default: auto-detect) |
| `--no-header` | CSV has no header → arrays of values |
| `--no-type` | Keep all values as strings |
| `--empty-as-null` | Empty CSV cells become `null` |
| `--skip-empty` | Omit empty cells from JSON objects |
| `--pretty` / `--compact` | JSON formatting (pretty is default) |

---

## Nested Values

When converting **JSON → CSV**, nested objects/arrays in a cell are serialized as JSON strings (and properly quoted). The header row is the union of all keys across every record, in first-seen order.

---

## License

MIT
