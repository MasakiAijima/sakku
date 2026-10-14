# Issues 6 and 8 verification

The editor keeps one authoritative `draft.scene`. Free and guided modes retain the scene and both multiline notes while navigating between steps 01, 02, and settings. Mode changes make no generation request. Opening a record starts in free mode; mode is presentation state and is excluded from record and generation payloads.

Guided mode shows the exact event and feeling text, joined by a blank line. The apply button explicitly replaces the scene with that text. A visible replacement notice precedes the preview. Combined text longer than 10,000 characters disables apply and shows a limit message without truncating either note. Helpers alone keep the selected haiku valid. Editing or applying a different scene disables stale selection, poem editing, refinement, and completed save. Returning to the same trimmed scene restores them without regeneration. The editor updates these controls without replacing the focused textarea.

`tests/input-language-screen.test.mjs` runs Chrome against intercepted API fixtures. It checks multiline preservation, mode changes without generation, exact explicit-apply payload, composition limits, settings navigation, step 02 focus/caret and stale state, trimmed reversion, regeneration, newline save payloads without mode, English settings across reload, translation/original toggles, generated and user text equal to UI dictionary keys, sans fonts, PNG export fonts, 320px width, and 200% root text size. The existing `tests/screen.test.mjs` remains the archive, draft, save-provenance, and layout regression test. CI runs both.

Run against the existing local development server:

```sh
TEST_BASE_URL=http://127.0.0.1:5184 SCREENSHOT_DIR=/tmp/sakku-input-review node tests/input-language-screen.test.mjs
TEST_BASE_URL=http://127.0.0.1:5184 SCREENSHOT_DIR=/tmp/sakku-input-review node tests/screen.test.mjs
```

Set `PLAYWRIGHT_MODULE` when Playwright is installed outside the project. Verification uses fixed data and makes no AI provider requests.

Local Chrome checks passed on 2026-10-14. Screenshots and the downloaded card are in `/tmp/sakku-input-review`. The 320px image at 200% root text size and the actual PNG export were visually inspected. No horizontal page overflow was observed. iPhone Safari, VoiceOver, and real provider translation quality remain unverified.
