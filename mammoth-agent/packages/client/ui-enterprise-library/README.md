# ui-enterprise-library

Web and desktop client entry for the single ground library at `/api/library`.
The left sidebar opens the library panel. The composer `+` command and the `@` menu attach ready versions as chips. Chips wait for the user's question. `@` serialization refetches the stored excerpt and refuses a version the server did not return.

Local files are not uploaded by this package. Saving into the library stays an explicit library action, and new uploads remain private on the server.

## Model Experience

An `@` library chip serializes to one untrusted excerpt block containing the server-returned file name, version id, locator, and quote. The model sees that block only after the user sends the draft. The package adds no tool and does not call a local model provider.

## Known Limitations and Deferred Work

Desktop packaging is not exercised here. The panel uses `MMP_GROUND_ORIGIN` when set, otherwise the page origin, which is the gateway origin for the hosted Web client. A direct desktop host without that origin cannot reach the library. OCR, spreadsheets, and ZIP contents stay download-only on the server.
