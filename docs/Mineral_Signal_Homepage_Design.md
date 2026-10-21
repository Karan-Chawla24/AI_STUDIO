# Mineral Signal homepage — design brief and handoff

19 October 2026 · Public marketing homepage · Selected visual direction: Mineral Signal

## Decision

The owner selected Mineral Signal. Cobalt Paper and Ink & Citrus Stitch projects were permanently deleted after explicit confirmation; only Mineral Signal remains from this exploration. The historical comparison document is archived. The approved brand source is [Mineral Signal brand guidelines](Mineral_Signal_Brand_Guidelines.md).

The homepage is interpreted as the public website, because the request emphasizes a website hero and attraction for visitors. The signed-in dashboard and other application screens come later. Educational Video Studio remains a working descriptor; Mineral Signal names the visual direction, not the product.

## Hero concept: an idea becoming an explanation

An asymmetric first viewport pairs expressive Bricolage Grotesque typography with an integrated visual demonstration. Left: “Make ideas worth watching.” and the supporting line “Turn what you know into clear, narrated videos—with visuals that follow your explanation.” Primary action: Create video. Secondary: Play the demo.

Right: a topic strip, a short storyboard sequence and a dominant vertical video specimen linked by a precise path. A dot travels through Phone → Router → Server as the caption emphasizes the related phrase. This makes the product's promise visible. It is an illustrative demo, never a fake live generation or a claim that video creation completes in seconds.

Keep the visual assembly aligned and readable. Small citron highlights identify active points. No floating-card pile, gradient cloud, robot or full dashboard screenshot. A real vertical explainer frame supplies the focal point. The generated video itself stays light and reserves a separate lower caption region.

## Motion specification

| Time | Intended action |
|---|---|
| 0–0.7 s | Topic strip appears; heading remains stable |
| 0.7–1.8 s | Two storyboard moments reveal in order |
| 1.8–3.4 s | Packet travels Phone → Router → Server; caption phrase emphasis follows |
| 3.4–4.5 s | Completed frame rests for reading |

Play once and rest; provide Replay and Pause. No autoplay sound. Reduced-motion preference shows the completed static frame. Hero animation must not cause layout shifts. If CSS/SVG motion is absent in the Stitch export, this table remains implementation guidance, not a statement that motion was delivered.

## Homepage content and purpose

1. Slim header: working wordmark, How it works, Examples, Questions, Sign in, Create video.
2. Hero and illustration described above, with the factual output summary: 60–90 second explainers, narration and captions, ready for Reels.
3. Capability strip: one idea → clear story → video; output specification rather than invented customer metrics.
4. Four connected steps: Plan, Storyboard, Generate, Publish. Explain review and editing before generation.
5. Explanation-driven motion showcase: purposeful diagrams and synchronized captions; user control through scene review.
6. Illustrative examples: How the internet works, Why prices rise, What is an API? No invented playable media files or testimonials.
7. Voice and finishing touches: two curated Indian-accent voices, Clean/Bold/Highlighted captions, optional music. No custom voice cloning or pacing slider.
8. Sharing: MP4 download, Instagram publishing and scheduling. Explain eligible connected professional-account requirement.
9. FAQs: editing scripts, included captions, 60–90 second duration, download without publishing, and creator review of AI-generated factual content.
10. Final action: “Have an idea? Make it understood.” Footer includes section navigation and future Privacy/Terms destinations.

No pricing, subscriptions, credits, teams, made-up reviews, free-plan promises, guaranteed generation speed or claims that AI verifies facts. Public copy describes the intended V1 product; the design is not evidence that those backend capabilities are deployed.

## Interaction and responsive acceptance

- Desktop: 12-column composition, maximum 1280 px inner width, 24 px gutters; hero heading around 72 px. Comfortable first-viewport presentation without clipping.
- Mobile: headline and actions precede demo; 40 px heading, 20 px outer margins, one column. Recompose the demonstration rather than shrinking labels to illegibility.
- Buttons and icon controls meet 44 px touch area; visible focus and persistent form labels.
- Verify actual font families and exact colors in export; avoid a generated third font or palette substitution.
- Check section anchors, FAQ, hero controls, reduced motion and keyboard interaction in implementation. A screenshot alone cannot establish behavior.
- CTAs to sign-in/create-video require real application routes during implementation; legal links require actual documents. Mock links are not deployment-ready.

## Deliverables

[Mineral Signal Stitch project](https://stitch.withgoogle.com/projects/4650166871878780934). Generated screen IDs and review results will be recorded alongside this brief after generation completes. This phase covers design, not backend development or production launch.

## Completed design and verification

Final homepage screen: `49c838e326b5490d9c2eaf1e58575692`. Final brand board: `64bde5183c494b79ba130796afad8259`. Resource URLs and deleted-project records are in `Mineral_Signal_Stitch_Deliverables.json`.

The downloaded final HTML was checked directly. Unsupported claims about 60 fps, uncompressed/lossless downloads, watermark policy, no-credit-card offers, automatic peak-time scheduling and generation in minutes were removed. The closing CTA has an explicit dark background. All inline JavaScript passes syntax checks, and the document has no duplicate element IDs.

Implemented in the export: finite packet movement via Web Animations API, a 4.5-second progress animation, pause/resume/replay handlers, a Play the demo handler that starts the sequence, and reduced-motion handling that skips initial autoplay. FAQ and illustrative sample-modal handlers are present. This is a packet-flow demonstration; full topic-to-storyboard choreography and actual audio/caption synchronization remain implementation goals, not verified delivered behavior. Reduced motion currently suppresses autoplay; explicit Replay still invokes animation, which should be tightened to the brand's static preference behavior in production.

Source inspection does not establish complete runtime accessibility or responsive behavior. The attempted local-browser preview encountered connection failures, so keyboard, mobile-menu and real browser interaction testing remain open. Sign-in/create-video routes, actual voice previews, real generated videos, backend publishing, legal pages and application state are outside this design prototype. Inspect the homepage visually in Stitch before expanding to the next screen.
