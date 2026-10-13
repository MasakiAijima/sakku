- [x] how over the affected subsystem. Existing CLI generates chroma originals; cutout normalizes visible long edge; gallery consumes72 row manifest.
- [x] architect for parallel design exploration. Choose separate revision outputs and final manifest replacement over overwriting accepted originals. No gallery UI change needed.
- [x] Blocking first steps. Issue19 updated,12canonical IDs identified, user waived earlier budget cap for this revision.
- [x] Independent workstreams. Root owns12prompt definitions; delegated runner owns exclusive temp script. Generation begins after input review.
- [x] Shared mutable state. Only final publisher updates gallery after12succeed. Reference files snapshot before API calls.
- [x] Smallest safe decomposition. One generator owner; no competing paid generation. Three independent paid calls at a time.
- [x] Delegate code-writing to a subagent. Isolated temp script, no shared source writes.
- [x] Verify on the matching surface. Inspect all12new illustrations and gallery72load, compare60unchanged hashes.
- [ ] Rebase into small, ordered commits. skip: user requested local asset revisions, no commit or PR requested.
- [ ] If the design is contested, interrogate before shipping. skip: no contested design.
- [ ] Run Opening a PR. skip: local previews only.

Independent input/runner review found no blockers. All12 generated successfully and visually compared before publication. Publication verified60 untouched entries and file hashes. All72 alpha/visible-size checks passed. Current gallery metadata includes12 revision overrides.
