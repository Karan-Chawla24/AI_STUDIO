# Mineral Signal — approved brand direction v1.0
Selected by the product owner on 19 October 2026. Cobalt Paper and Ink & Citrus are rejected.
The product is an AI Educational Video Generator. "Educational Video Studio" is a working descriptor, not a finalized product name; "Mineral Signal" is the visual system name, not the website brand.
## Personality
Modern, minimal, imaginative and professionally futuristic. Warm editorial clarity, restrained color, careful typography. Signature: a moving dot along a precise explanation path. No purple gradients, glows, star logos, random floating UI, glassmorphism or robot imagery.
## Authoritative colors
canvas #F6F4EE; surface #FFFEFA; ink #183832; muted #52655F; primary teal #087F75; hover #06665E; selection tint #E2F1EB; citron accent #D8EB75; decorative border #D6DED5; control border #74867D.
Primary buttons: white on #087F75. Citron uses #183832 text, never white. Neutral surfaces dominate (roughly88%), teal about10%, citron2%. No large neon panels. The border token is for decoration; actual inputs use the stronger control border.
Success #21633F on #E9F4EC; warning #785000 on #FFF4D6; error #A52A2A on #FDECEC. State labels and icons supplement color.
## Typography
Exactly two families: Bricolage Grotesque 500/600 for display/section headings, Manrope400/500/600 for body, labels, controls and numeric metadata. No JetBrains Mono or third font. Tabular numerals for timecodes.
Homepage hero desktop72px /1.06 tracking-0.035em, tablet56px, mobile40px. App page headings28–32px; sections24px; body16px/1.5, prominent intro18px/1.6, labels14px, nonessential metadata12px minimum. Sentence case; no tiny uppercase paragraphs.
## Space and shape
Spacing4,8,12,16,24,32,48,64,96px. Desktop12columns with24px gutters and max1280px content; mobile20px margins. Controls8px radius, cards12px, dialogs16px; avoid rounded pills everywhere. Buttons44px high, hero48px; touch controls44px square minimum. Thin separators and empty space do more work than boxes. Shadows only on a hero specimen or actual floating overlays.
## Product boundaries
Plan → Storyboard → Generate → Publish. 60–90second vertical explainers, editable reviewed scenes, two curated Indian-accent voices, synced captions, optional music, MP4 download and Instagram publish/schedule. No billing, credits, teams, custom voice cloning, full editing timeline, provider controls, factual-verification claims or arbitrary pacing sliders.
## Content and iconography
Use consistent outline vector icons,24px grid,1.5–2px stroke. Show Phone → Router → Server as the educational example. Keep video light with captions in their own safe region. Homepage visuals must demonstrate how an idea becomes an explanation, not use meaningless decorative assets. No fabricated users, testimonials, ratings, brands or time-saving metrics.
## Motion
Functional UI120–160ms; transitions180–240ms. Hero is an illustrative demo, not fake live generation. Design a clear4.5second sequence:0–0.7s topic appears,0.7–1.8s scene nodes reveal,1.8–3.4s dot travels Phone→Router→Server with synchronized caption phrase highlighting,3.4–4.5s completed frame rests. Prefer play once then rest, explicit Replay and Pause controls; never autoplay sound. Respect prefers-reduced-motion with static completed frame. No perpetual bounce, rotation, parallax or decorative background animation. Use CSS/SVG motion if Stitch can implement it; otherwise show a coherent static keyframe and annotate the handoff outside the public-facing design.
## Accessibility
Target normal text4.5:1, large text3:1, essential boundaries/focus3:1. Verified pairs: white/teal4.88:1; muted/ivory5.64:1. These checks are not a whole-page compliance certification. No AAA or color-vision compliance claims. Visible2px teal focus ring with2px surface offset; labels remain visible. Error text gives a correction. Mobile reflows and keeps readable labels.
## Messaging
Headline: Make ideas worth watching.
Subhead: Turn what you know into clear, narrated videos—with visuals that follow your explanation.
Plain specific copy: Review your storyboard; Preview your video; Publish when you're ready. No guaranteed generation speed, automatic fact-checking, no-credit-card/free-plan promises.

## Selected project

[Open Mineral Signal in Stitch](https://stitch.withgoogle.com/projects/4650166871878780934)

Design system asset: `assets/10932773132637887051`. The finalized brand board and homepage generations reference this asset directly. Stitch's project-level update method rejected its request, so the saved asset and each screen's attached design system are the verified linkage.

## Files and verification

- [Design tokens](Mineral_Signal_Design_Tokens.json): approved colors, fonts, spacing, shape and motion values.
- [Homepage brief](Mineral_Signal_Homepage_Design.md): public-page composition, sections and motion intent.
- Finalized brand board screen: `64bde5183c494b79ba130796afad8259`.
- Export inspected: two text font families confirmed; no JetBrains Mono, AAA or 11.4:1 claim found. The recorded 4.88:1 and 5.64:1 pairs are present.
- Additional calculated pairs: control border against surface 3.82:1; success 6.37:1; warning 6.50:1; error 6.20:1. These are token checks, not full accessibility certification.
