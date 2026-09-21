# ESPro Marks Assistant

A Chrome extension that safely transfers marks from a faculty member's
Excel mark list into ESPro's web-based marks-entry system — with
matching, a review preview, and verification before anything is written.
Faculty still do the final Save/Submit in ESPro themselves.

**Status:** built and tested against a local mock of ESPro's marks-entry
page (`mock-espro/`), since the real ESPro DOM isn't available yet. Once
we have it, only `extension/src/espro/` (the adapter layer) and the
`content_scripts`/`host_permissions` matches in
`extension/manifest.config.ts` need to change — everything else (parsing,
matching, validation, the popup UI) was built against the adapter
interface and doesn't know the difference.

## Project layout

```
extension/       The Chrome extension (Manifest V3, TypeScript, React, Vite)
  src/
    popup/       Faculty-facing UI: import → review → preview → fill → verify
    content/     Runs on ESPro pages, answers messages from the popup
    background/  Service worker; holds the parsed workbook for the session
    parser/      xlsx parsing + column detection (pure, no DOM)
    matcher/     Excel × ESPro matching engine (pure, no DOM)
    validation/  Mark validation (pure)
    espro/       The ONLY place that knows ESPro's actual DOM structure
    types/
  tests/         Vitest — 45 tests covering parsing, matching, DOM
                 discovery, filling/verification, and edge cases
mock-espro/      Standalone mock of a legacy ESPro marks-entry page,
                 used for development and demos until we have the real one
sample-data/     A synthetic mark list (sample_marks.xlsx) engineered to
                 exercise every match status against the mock page
```

## Running the demo

1. **Serve the mock ESPro page** (any static server works; it must be on
   port 8765 to match the extension's permissions):
   ```bash
   cd mock-espro && python3 -m http.server 8765
   ```
   Open http://localhost:8765/index.html to see it on its own.

2. **Build the extension:**
   ```bash
   cd extension && npm install && npm run build
   ```

3. **Load it in Chrome:**
   - Go to `chrome://extensions`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select `extension/dist`

4. **Try the flow:**
   - Click the extension icon → drag in `sample-data/sample_marks.xlsx`
   - Switch to the http://localhost:8765 tab → back in the popup, click
     "Check ESPro page"
   - Review the preview table (it's engineered to show every status:
     matched, not found, duplicates on both sides, an already-filled
     mark, an invalid mark, a missing mark, and normalization across
     case/whitespace)
   - Click "Fill" and watch the verified/failed summary

During development, `npm run dev` in `extension/` gives you hot-reload
instead of a full rebuild per change.

## Tests

```bash
cd extension && npm test        # 45 tests, no browser required
npm run typecheck
```

## Why a mock ESPro page

Building selectors against a guessed DOM structure is exactly the kind of
guess that could put a mark on the wrong student — so nothing here
assumes real ESPro's HTML. `mock-espro/` reproduces the kind of
structural quirks a legacy, server-rendered university ERP typically has
(non-semantic control IDs, plain-text identifiers with no data
attributes, client-side pagination, an already-filled field, a duplicate
identifier, a malformed row) so the matching/validation/fill logic could
be built and tested properly in the meantime. It gets replaced with the
real thing as soon as we have it.
