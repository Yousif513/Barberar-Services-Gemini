# Fifteen regional voice audition scripts

Prepared2026-10-22 from the current CEO accent policy and the original persona registry. Status: proposed scripts awaiting native text review and actual audio evaluation. All6male presentations target Saudi Arabic; all9female presentations target Lebanese Arabic. Historical source voice directions are copied verbatim into the new input; the registry, existing en-US samples and dashboard are unchanged.

- AUDITION_INPUT.json: all15role passages, Arabic/English chunks, common SAR/date/identifier challenge, interruption-response proposal, proposed delivery, source/script hashes and two unselected stock provider candidates.
- scripts/: readable per-persona scripts and common blind passage.
- ssml/portable/:15W3C1.1 plans without selecting a voice.
- ssml/azure-candidate/:15Azure1.0 candidate plans under one fixed regional voice per accent group; no unsupported lang switching.
- ssml/blind-candidate/:15trial-one identical-content candidate plans; four further shared trials are supplied as text in the input for a later actual blind test.
- PRONUNCIATION_LEXICON.json: proposed name/number/date/domain readings; no native acceptance or IPA claim.
- EVALUATION_RUBRIC.json, EVALUATOR_SHEET.csv, BLIND_TRIAL_SHEET.csv and NATIVE_REVIEW_PROTOCOL.md: explicit weighted gates, blank observations, independent native panel and blinded identity design.
- SSML_NOTES.md: primary documentation and compatibility limits.
- VALIDATION.json: structural checks only, never an acoustic score.

The figures are openly invented public audition fixtures: SAR1,250.75;22October2026;09:30Riyadh;reference0072. They are not customer records, transactions, approved rates or evidence of business work. Role scripts are attributed synthetic speech examples, not a performed task. Identity style varies; reasoning, memory, source truth and authority do not change.

Rate, pauses and role-specific text do not create fifteen distinct provider timbres. The current Hamed/Layla candidates are only two baseline voices. An actual candidate must pass native regional, material-accuracy, switching and identical-content blind identity gates; poor distinctness remains a failure rather than being hidden by self-introductions. Existing English samples are not replaced or accepted for the new accents.

Audio/, provider-report.json and RESULTS.md are owned by the parent synthesis/evidence task; this package does not assert their existence, actual provider output or listening scores. No paid request, external invitation, voice cloning, business activation, financial transaction, permission grant or UI change was performed by this worker.

## Hash verification basis

`PACKAGE_HASHES.json` records SHA-256 for the69worker-owned package files after strict UTF-8 decoding and replacement of CRLF pairs with LF. This makes verification stable when Windows Git checkout changes text line endings. Preserve every other character, a possible UTF-8 BOM, lone CR characters, Unicode normalization, whitespace and final newline exactly; do not trim or reformat. Verify each listed entry with:

```python
actual = sha256(path.read_bytes().decode("utf-8").replace("\r\n", "\n").encode("utf-8")).hexdigest()
```

This package-file basis is different from `AUDITION_INPUT.json.source_records[].sha256`: those existing registry/policy hashes capture the exact original source-file bytes at preparation time, with no line-ending normalization. Keep the captured source hash values unchanged; they are provenance snapshots, not promises that a later checkout has identical raw bytes. The script text hash in each audition is SHA-256 of its exact `full_text` UTF-8 string, also without line-ending normalization; consumers must not silently reformat that string. Package hashes do not establish native review, audio quality, accent compliance or provider acceptance.

Next step: native-review the exact scripts, then use only an authorized provider path to synthesize candidates and record actual receipts/results without asserting acceptance.

Ready-to-send prompt: Review the fifteen proposed Saudi male and Lebanese female audition scripts, correct regional pronunciation with native speakers, and generate candidates only through the authorized provider path. Keep actual scores blank until listening, retain failed identity tests and preserve all current approval holds.
