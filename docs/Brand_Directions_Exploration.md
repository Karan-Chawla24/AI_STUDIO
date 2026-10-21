> Superseded by [Mineral Signal brand guidelines](Mineral_Signal_Brand_Guidelines.md). This file preserves exploration history only.

# Brand directions — Educational Video Studio

19 October 2026 · Archived exploration · Mineral Signal selected and finalized by the product owner

“Educational Video Studio” is a working descriptor, not a final product name. The three names below describe visual directions. This exploration defines the application brand; generated video themes remain a separate design system, with the light, readable visual treatment established in the PRD.

## Shared brief

Make a modern, minimal creative tool with personality, professional clarity and restrained energy. Its visual identity should express the product's real strength: turning an explanation into a sequence of clear visual moments. Use a precise path, connector and moving dot as a recurring motif. Typography, composition and small purposeful details should provide the character.

The product flow is Plan → Storyboard → Generate → Publish. The interface should feel approachable to creators who do not use technical video tools. Keep provider names, APIs, databases and render internals out of normal creator screens. Do not add pricing, credits, teams, analytics dashboards or features outside the PRD to make a concept look more complete.

Avoid the generic AI visual vocabulary: glowing purple gradients, star/sparkle logos, decorative robots, blurry orbs, arbitrary floating cards, glass panels everywhere, identical pill buttons and a marketing page made entirely of rounded boxes. Futuristic here means precise, responsive and carefully composed.

## Archived comparison — no longer active options

| Direction | Character | Typography | Best reason to choose | Watch-out |
|---|---|---|---|---|
| A — Cobalt Paper | Crisp, editorial, confident | Space Grotesk + Inter | Clean professional baseline with energetic blue | Blue can feel familiar; the layout and diagram motif must carry distinctiveness |
| B — Mineral Signal | Warm, creative, thoughtful | Bricolage Grotesque + Manrope | Most distinctive balance of personality and everyday usability | Too much chartreuse or rounded display type can make it playful |
| C — Ink & Citrus | Focused, precise, studio-like | Sora + IBM Plex Sans | Strongest dark studio atmosphere and luminous video previews | Dark surfaces require careful contrast and can feel heavier during long text editing |

Initial recommendation: **B — Mineral Signal**. It fits an educational creative product and gives it a recognizable voice while leaving room for calm editing screens. A is the alternative if the priority is a crisp professional appearance. C is the deliberately darker comparison, not a commitment to implement a complete second theme.

## A — Cobalt Paper

| Token | Hex | Role |
|---|---|---|
| canvas | #F7F8FA | Main background |
| surface | #FFFFFF | Editor, menus and raised panels |
| text | #172033 | Primary text |
| text-muted | #566176 | Secondary readable copy |
| primary | #2854E8 | Main action and selection |
| primary-hover | #2044BE | Hover/pressed emphasis |
| primary-soft | #EAF0FF | Selected region/background |
| accent | #F3B88C | Small diagram/editorial highlight; dark text only |
| border | #DCE1E9 | Decorative separators |

Space Grotesk 500/600 for expressive headings; Inter 400/500/600 for interface and body. Neutral canvas occupies roughly85–90% of a view. Blue carries attention, apricot appears sparingly. White labels on primary buttons. Controls8px radius, panels12px. Compose with strong left alignment, thin rules and a deliberate oversized heading; avoid scattering equal-sized cards across every surface.

Brand line specimen: **Clear thinking. Visible.**

## B — Mineral Signal

| Token | Hex | Role |
|---|---|---|
| canvas | #F6F4EE | Warm main background |
| surface | #FFFEFA | Editor and raised panels |
| text | #183832 | Deep green-black ink |
| text-muted | #52655F | Secondary readable copy |
| primary | #087F75 | Main action and active navigation |
| primary-hover | #06665E | Hover/pressed emphasis |
| primary-soft | #E2F1EB | Selection and subtle emphasis |
| accent | #D8EB75 | Small index/diagram highlight with ink text |
| border | #D6DED5 | Decorative separators |

Bricolage Grotesque 500/600 for display and section headlines; Manrope 400/500/600 for interface and body. Use expressive type sparingly; do not put display typography in table data or form controls. About85–90% neutral,8% deep teal,2% citron as a composition guide. White labels on primary buttons. Controls8px, panels12px. Editorial whitespace and offset compositions give the identity its character without sacrificing alignment.

Brand line specimen: **Big ideas. Beautifully explained.**

## C — Ink & Citrus

| Token | Hex | Role |
|---|---|---|
| canvas | #141719 | Dark main background |
| surface | #1D2225 | Editor and primary panels |
| surface-raised | #272E32 | Menus/overlays |
| text | #F2F4EF | Primary text |
| text-muted | #ADB7B8 | Secondary readable copy |
| primary | #D8ED83 | Main action and active selection |
| primary-hover | #C6DF68 | Hover/pressed emphasis |
| primary-soft | #30392B | Subtle selection background |
| accent | #9DBCE8 | Small diagram/timecode detail |
| border | #394246 | Decorative separators |

Sora 500/600 for headings; IBM Plex Sans 400/500/600 for interface and body. Roughly90% dark neutrals, with citron limited to focal actions and small marks. Primary buttons use dark ink text, never white. Controls6px, panels10px. Flat tonal surfaces create depth. Timecodes use tabular numerals, not a science-fiction font. Light video previews remain visually distinct from the surrounding dark app.

Brand line specimen: **An idea, brought into focus.**

## Shared typography and layout rules

- Display specimen: A/B64px, C60px; line-height1.08; tracking around-0.025em. Mobile36–40px. Use only in brand/marketing moments.
- Application page title:28–32px/1.2, weight600. Section heading20–24px/1.3. Avoid oversized marketing headings throughout the editor.
- Body16px/1.5; labels14px/1.4; metadata12–13px only for nonessential details. Form inputs remain16px on mobile. Sentence case by default.
- Maximum two font families per direction. Use weights400,500,600; no need to download every weight. Production must verify font availability, licensing and loading/fallback behavior before locking the selected family.
- Spacing scale4,8,12,16,24,32,48,64,96px. Desktop12-column grid,24px gutters, max content width1280px; mobile20px outer margin and one clear reading order.
- Buttons44px high minimum; icon controls have at least44×44px touch area. Use one dominant action per region, consistent icon position and verb labels.
- Panels should group related work. Use spacing and dividers before adding another bordered container. Shadows are reserved for overlays and modest elevation, not every row.
- Lucide-style consistent outline icon language:24px grid,1.5–2px stroke. Pick one icon family at implementation. A custom connector/sequence motif can distinguish the brand without inventing a complex logo now.

## Components, states and accessibility

Each Stitch board should show the same small specimen set: primary/secondary buttons; topic input; focus and error states; Draft, Generating, Needs review and Published chips; four-step workflow; one storyboard scene row; a9:16 educational diagram with captions in their own safe area. These samples are for evaluating brand behavior, not completed app screens.

Neutral Draft; active Generating; warning Needs review; success Published. Every status includes a readable label and optional icon; never convey state with color alone. Primary brand teal is not automatically a success status. Error red is a semantic token, not a decorative brand accent.

Light-theme semantic proposals: success text #21633F on #E9F4EC; warning #785000 on #FFF4D6; error #A52A2A on #FDECEC. Dark-theme proposals: success #9DDDB3 on #193526; warning #F1CF82 on #3A301B; error #F3AAAA on #3C2426. Contrast-check every actual pair before use.

Target readable text contrast >=4.5:1, large text>=3:1, essential control boundaries/focus>=3:1 against adjacent colors. Decorative border tokens are intentionally subtle and must not be the only indicator of an input boundary: use stronger dedicated control-border tokens and a visible label. Focus uses a2px high-contrast ring with2px offset; test against every adjacent surface. Disabled is not merely low opacity; communicate why an action is unavailable.

Calculated contrast checks for the proposed hex values (not a full audit of Stitch output):

| Direction | Primary button label/fill | Secondary text/background |
|---|---|---|
| A | White on #2854E8: 5.96:1 | #566176 on #F7F8FA: 5.87:1 |
| B | White on #087F75: 4.88:1 | #52655F on #F6F4EE: 5.64:1 |
| C | #141719 on #D8ED83: 14.03:1 | #ADB7B8 on #1D2225: 7.83:1 |

Motion:120–160ms hover/focus,180–240ms panel transition,300–450ms explanation-path reveal. Move only the element that communicates progress. No perpetual decorative animation, cursor trails or parallax. Respect reduced motion with instant state changes or short fades. Loading labels reflect actual work; progress never pretends an exact percentage if unknown.

## Voice and imagery

Use short, calm, specific language: “Review your storyboard”, “Your video is ready”, “Reconnect Instagram”. Keep errors useful: what happened, what was saved, what can happen next. Avoid exaggerated “magic”, “revolutionary” and unsupported claims about factual accuracy or generation speed.

Show actual educational diagrams, vertical video frames and legible scene content. Reuse the same Internet explainer sample across alternatives. Keep vector geometry consistent. No invented customers, testimonials or statistics in later homepage concepts. Marketing composition may be expressive while editor controls remain quiet and familiar.

## Selection decision

- A — Cobalt Paper: rejected; Stitch project permanently deleted with confirmation.
- [B — Mineral Signal](https://stitch.withgoogle.com/projects/4650166871878780934)
- C — Ink & Citrus: rejected; Stitch project permanently deleted with confirmation.

The written hex values and usage rules are the proposed source of truth; generated Stitch palettes can drift and must be reconciled after selection. We are comparing brand direction, not approving generated code or proving accessibility from screenshots.

Review notes: Stitch added a third monospace font for token labels in the light boards. Keep the application to the two specified families and use tabular figures for metadata. The Mineral Signal generation describes an AAA contrast standard; this is not a verified accessibility claim and must not be carried into the final guidelines or product. The contrast table above is the measured evidence for the six specified pairs only. Generic educational labels such as “Server” should replace the generated “Root Server”/“Edge Server” in the comparison sample to keep content identical. These corrections belong in the selected direction's refinement pass before homepage implementation.

Choose by four questions: Does it feel distinctive? Is it comfortable for reading and editing? Does it let the educational video stand out? Does the accent feel controlled? Record one chosen direction and any specific changes. Then finalize tokens and design a single homepage to test the direction before expanding to the application screens. Product naming and whether that first homepage is public landing or signed-in dashboard can be settled at that next step.

All three Stitch boards completed and their overall compositions were visually inspected. Screen/resource links are retained in `Brand_Directions_Stitch_References.json`. Direction C also added an unsupported voiceover-pacing input and broad color-vision accessibility claims. Those are generated exploration artifacts, not approved product features or proven compliance; replace the input with the common topic-error specimen and remove those claims in refinement. Preserve the calmer motion rules above rather than carrying over glowing/pulsing decoration. No homepage or production application has been built in this step.
