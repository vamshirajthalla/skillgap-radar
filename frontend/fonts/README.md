# fonts/

Self-hosted, so the app makes no font requests to outside servers.

- Bricolage Grotesque (headings), Instrument Sans (body), JetBrains Mono (numbers and tags).
- All three are SIL Open Font License; the license files are alongside.
- Only Regular (400) and Bold (700) of each are bundled. Weights 500 and 600 in the CSS resolve to the nearest one.

To use different fonts, add their files here and edit css/fonts.css and the
--font-display / --font-body / --font-mono variables at the top of css/style.css.
