# ADR-0006: Dark-only visual design based on Gemini's dark palette

- Status: Accepted
- Date: 2026-10-18

## Context
The developer asked for an app design using the dark colours of Google's Gemini app. The first UI
(IT-002) followed the system light/dark setting with a generic blue palette.

## Decision
- The app is **dark-only** (`userInterfaceStyle: "dark"`, single `palette` in
  `apps/mobile/src/theme/theme.ts`).
- Colour tokens are taken from Gemini's dark theme as rendered by gemini.google.com
  (`--gem-sys-color--*` CSS variables, read on 2026-10-18), i.e. Material 3 roles:
  `surface #131314`, `surface-container #1E1F20 / high #282A2C / highest #333537`,
  `on-surface #E3E3E3`, `on-surface-variant #C4C7C5`, `on-surface-low #9A9B9C`,
  `outline-variant #444746`, `primary #A8C7FA` / `on-primary #062E6F`,
  `primary-container #1F3760` / `#D3E3FD`, `error #F2B8B5`, recording red `#F55E57`.
- Signature accent: the blue → purple → pink gradient (`#4E8FF8 → #AD72FF → #FFAEE4`) on the
  identify button, listening ripples, artwork placeholder and history tiles
  (`expo-linear-gradient`).
- Material icons via `@expo/vector-icons` (needs `expo-font`); pill-shaped buttons; rounded
  (24 px) cards; no borders on cards; header without divider.
- Only colours are borrowed. No Google/Gemini logos, sparkle mark, names or Google Sans font.

## Consequences
- Users with a light system theme still get the dark app. Reintroducing light mode means adding a
  second palette (Gemini's light tokens were also observed: surface `#FFFFFF`, container
  `#F0F4F9`, on-surface `#1F1F1F`, primary `#0B57D0`).
- RN has no blur: the glow is approximated with stacked translucent discs.
- Verified visually only in the web preview (react-native-web); device rendering (shadows,
  gradients, icon font) still needs MOB-2/MOB-8.
