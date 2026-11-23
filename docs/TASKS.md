# Tasks — next (M4: playable MVP)

1. World 1024×1024 as default; move generation to a Web Worker (transfer chunk buffers) with loading progress.
2. Save system (`src/storage/`): IndexedDB, versioned schema {version, seed, size, progression, emitters, modified chunks (mat+hp, compressed RLE)}, autosave every 30 s + on pause/hide, safe transactions, recovery from invalid saves, reset with confirmation, explicit error UI. Storage interface so a cloud backend can be added.
3. First hidden resonance core: generated structure of Core Material + Titanium shell deep in the world; discovery hint (scanner ping), destruction → victory screen (stats, continue playing).
4. Main menu: Continue / New game / Settings (volume, quality: particle count, DPR cap) / Reset.
5. Progress indicator toward the core (depth + scanner distance).
6. Tests: save round-trip, corrupted save recovery, reload keeps progress (e2e), victory flow.

Known follow-ups
- Touch: on-screen movement controls still minimal (fire + drift).
- Firefox/WebKit not yet tested.
