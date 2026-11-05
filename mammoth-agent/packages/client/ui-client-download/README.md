# ui-client-download

Web-only sidebar footer action that opens the desktop-client download dialog
(Apple silicon Mac / Intel Mac / Windows), mirroring the 中台 console dialog.
The registration skips the Desktop client (`window.mmpDesktop`), where
downloading a client would be meaningless.

The expanded sidebar uses a compact rounded download card with a tinted icon, title and directional cue, aligned with the account area. The collapsed sidebar keeps a centered icon with a tooltip. Both layouts support keyboard focus and reduced motion.

## Model Experience

No model-visible surface: this package renders a static download action and
dialog; it adds no prompts, tools, or session events, and consumes no tokens.
