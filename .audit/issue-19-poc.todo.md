# Issue 19 PoC

- [x] Ground. Master, motif spec and current static artwork loader inspected.
- [x] Sketch. Asset manifest registry separates offline generation and app loading. PNG plus animated WebP compared with sprite candidate in PoC.
- [x] Agree. User selected API model and local key; budget 1000 JPY.
- [x] Implement. Generate 3 candidates, package and load saved assets.
- [x] Scrap. PNG validation strengthened after independent review.
- [x] Blocking first steps. Issue scope updated, credentials and model checked before requests.
- [x] Independent workstreams. Loader and packager use exclusive worktrees; generation stays in main.
- [x] Shared mutable state. Main alone publishes generated files and manifest.
- [x] Smallest safe decomposition. Two code owners, one serial generation owner.
- [x] Verify actual generated assets and live loader. Quality changes required before72 expansion.
- [x] Record remaining gates and estimated cost; do not mark entire issue complete.
