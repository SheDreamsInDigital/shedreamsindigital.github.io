# Personal Goals Studio

A responsive browser app for planning and tracking personal goals from desktop or mobile browsers. It no longer depends on Notion or a relay. Instead, it can use an uploaded or pasted export of an existing tracker layout as inspiration for a private, local goals dashboard.

## How it works

1. Add goals manually, or upload/paste an exported tracker layout.
2. The app detects likely tracker rows or headings and converts them into editable draft goal cards.
3. Check in on goals to update progress.
4. Export a JSON backup whenever you want to save or move your data.

All goal data, imported layout text, and check-ins are stored in this browser's `localStorage` unless you export them.

## What to send for a layout-based version

If you provide an upload version of your tracker page, I can make the app mirror the present layout more closely. Useful formats are:

- HTML export of the page
- CSV export of a tracker table
- Markdown or text export
- JSON export
- A screenshot for visual reference, plus a text/CSV export for the actual fields

Helpful context:

- The goal areas/categories you want to keep
- Whether you prefer daily checkboxes, streaks, weekly reviews, notes, or dashboard totals
- Any colors, labels, or section names that should match your current tracker
- Whether the app should remain browser-only or eventually support optional sync/export destinations

## Local development

Because this is a static site, you can serve it with any local web server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
