# data/ — placeholder

This directory used to hold raw student roster files, SP ledger CSVs,
session attendance reports, and other personally-identifying information.

**Those files have been removed from this public repository on 2026-07-14.**

If you cloned this repo before that date, the originals are still in your
local clone and in the git history (`git log --all -- data/students.json`).

## How to bring data back

The Spurti app loads data from local files at startup. The expected files:

| File (original)                                    | Purpose                                     |
|----------------------------------------------------|---------------------------------------------|
| `data/students.json`                               | Master student roster (id, name, email, etc.) |
| `data/students-start-on-or-before-2026-05-NN.csv`  | Roster snapshots used during migration       |
| `data/sp_ledger_19may.csv`                         | SP ledger history                             |
| `data/sp_transactions_20may.csv`                   | SP transactions history                       |
| `data/sp_balance_sheet_*.pdf`                      | PDF balance sheets (Spurti-generated)         |
| `data/excused-emails.txt`                          | Emails of excused students                    |
| `data/ingestion_manifest.json`                     | Ingestion job manifest                        |
| `data/exports/*.csv`                               | Generated exports of SP / attendance          |

If you have the originals, drop them into `data/` and the Spurti
seed/import scripts will pick them up. If you do not, the app starts with
an empty database and you can use `server/scripts/seed.js` and the
`seed-students.js` / `seed-excused-students.js` root scripts to create
fixtures.

## Shape reference

See `data/example/students.sample.json` for a one-row, fully-fake example
of the student roster shape. See `data/example/sp-ledger.sample.csv` for
the SP ledger column ordering.
