---
name: Syllabus Crew
description: A study agent in iMessage, drawn as a watercolor campus with five crew characters.
colors:
  ink: "#1e2740"
  ink-ledge: "#0d1326"
  cream-ground: "#f3eee2"
  paper: "#fffcf5"
  muted-ink: "#5d6377"
  hairline: "#e0d8c6"
  hairline-hover: "#c9bfa8"
  track: "#ebe4d3"
  panel: "#e9e1cf"
  tabs-well: "#dcd3bd"
  highlighter: "#ffdf6b"
  highlighter-soft: "#fbf1c9"
  lead-teal: "#2c6e6a"
  scout-amber: "#d98b2b"
  tutor-brick: "#c8553d"
  planner-periwinkle: "#6d7fb3"
  nudger-sage: "#7a9e5a"
  bubble-gray: "#eee8d9"
  imessage-blue: "#2f6fed"
  good: "#2f7a5b"
  bad: "#c2412d"
typography:
  display:
    fontFamily: "Fraunces, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(44px, 4.6vw, 70px)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Fraunces, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(32px, 3.6vw, 48px)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Fraunces, Iowan Old Style, Georgia, serif"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.02em"
  body-lead:
    fontFamily: "Figtree, ui-sans-serif, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "17.5px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.4
  bubble:
    fontFamily: "Figtree, ui-sans-serif, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.38
rounded:
  tag: "6px"
  chip-inner: "10px"
  button-small: "12px"
  button: "14px"
  feature: "16px"
  bubble: "18px"
  card: "20px"
  panel: "26px"
  phone: "46px"
  pill: "99px"
spacing:
  gutter-mobile: "18px"
  gutter: "40px"
  container: "1240px"
  band: "112px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "12px 20px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "12px 20px"
  button-small:
    rounded: "{rounded.button-small}"
    padding: "9px 16px"
  chip-filter:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
    typography: "{typography.label}"
  chip-filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "20px"
  map-pin:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "5px 15px 5px 5px"
    typography: "{typography.label}"
  phone:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.phone}"
    width: "330px"
  bubble-agent:
    backgroundColor: "{colors.bubble-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "8px 12px"
    typography: "{typography.bubble}"
  bubble-student:
    backgroundColor: "{colors.imessage-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.bubble}"
    padding: "8px 12px"
    typography: "{typography.bubble}"
---

# Design System: Syllabus Crew

## Overview

**Creative North Star: "The Campus That Texts You"**

A watercolor campus on cream paper, written over in ink navy, with one highlighter for what matters. Five crew members (Crew Lead, Scout, Tutor, Planner, Nudger) are stationery with faces, each carrying one color that follows it everywhere: its character, its map pin, its "who" dot above a bubble, its selected state. The iMessage thread is the product, so a tilted, ink-framed phone is the recurring hero object.

The tone is calm and tactile: paper cards with hairline borders, soft diffuse shadows, and controls that lift when you point at them and sink when you press. Density is relaxed; bands breathe. The same tokens drive three surfaces: the dashboard (`apps/web/app/globals.css`, `crew.tsx`), the pitch page (`apps/site/styles.css`), and the tap-to-open card pages (`apps/cards/app/cards.css`). When one changes, change all three.

**Key Characteristics:**
- Cream ground, paper cards, ink type and ink primary buttons.
- One highlighter yellow, used as a marker stroke, never as a fill for surfaces.
- Five crew colors, one per specialist, used for identity only.
- Fraunces for display, Figtree for everything you read or press.
- Press feel: spring overshoot on hover lift, fast sink on press.
- Painted places (campus, library, seminar desk) faded into the ground with masks and washes, never framed as photos.

## Colors

Warm paper neutrals under a cool ink, with five muted crew hues and one bright highlighter.

### Primary
- **Ink Navy** (ink): all type, primary buttons, the phone frame and its notch, focus rings, slider fill, dashed wiring lines. **Ink Ledge** (ink-ledge) is the 2px base under a primary button.

### Secondary
- **Highlighter** (highlighter): the marker stroke under key words in headlines (`<em>`, `<mark>`), text selection, and the outline on a pressed map pin. **Soft Highlighter** (highlighter-soft) backs "miss" ticks, the reminder band on the clock, and the dashboard's ask card.

### Tertiary: the crew
- **Lead Teal** (lead-teal): Crew Lead, the router; also numbered seat steps.
- **Scout Amber** (scout-amber): Scout, the watcher of the course feed.
- **Tutor Brick** (tutor-brick): Tutor, quizzes.
- **Planner Periwinkle** (planner-periwinkle): Planner, proposals and the proposed calendar block.
- **Nudger Sage** (nudger-sage): Nudger, reminders and timing.

Crew colors are darkened for white numerals (`color-mix(in srgb, <crew> 72%, #000)`) and tinted for chips (`color-mix(... 16%, paper)` background, `70%` with black for text).

### Neutral
- **Cream Ground** (cream-ground): page background and `theme-color`; every painting fades to it.
- **Paper** (paper): cards, buttons, pins, the phone screen.
- **Muted Ink** (muted-ink): secondary copy, captions, descriptors.
- **Hairline** (hairline): 1px borders and section rules; **Hairline Hover** (hairline-hover) on hover.
- **Track / Panel / Tabs Well** (track, panel, tabs-well): slider and chart tracks, inset panels, the segmented-tab well.
- **Bubble Gray** (bubble-gray) and **iMessage Blue** (imessage-blue): agent and student bubbles.
- **Good / Bad** (good, bad): state only (hit, approved, refused, "Beta:" limits).

### Named Rules
**The One Color Per Crew Rule.** Each specialist owns its hue on every surface; never reuse a crew color for decoration or for a different agent.

**The Marker Not Paint Rule.** Highlighter appears as a stroke under text (roughly the lower 35-40% of the line) or as an outline, not as a background for cards or buttons.

## Typography

**Display Font:** Fraunces (with Iowan Old Style, Georgia)
**Body Font:** Figtree (with system-ui)

**Character:** A soft, slightly bookish serif for headings and big numbers against a friendly geometric sans for everything functional. The pairing reads like a well-kept notebook.

### Hierarchy
- **Display** (500, clamp(44px, 4.6vw, 70px), 1.06, -0.02em): the page's single h1. The dashboard hero uses clamp(40px, 5vw, 64px).
- **Headline** (500, clamp(32px, 3.6vw, 48px), 1.06): section h2s.
- **Title** (500, 20-34px): card and stop h3s; also big numerals (slider values, clock, weights) with `lining-nums tabular-nums`.
- **Body lead** (400, 17.5px, 1.5): section intros, max 46-60ch.
- **Body** (400-600, 15.5px): buttons, features, list rows.
- **Label** (600-700, 13.5px): pin labels, filters, captions; sentence case.
- **Bubble** (400, 14px, 1.38): message text, `pre-wrap`.

### Named Rules
**The Serif Speaks Rule.** Fraunces is for headings, quotes, and display numerals only; anything you tap is Figtree.

## Layout

A centered container (1240px, 40px gutters, 18px under 700px) holds bands spaced 112px apart (104px on the dashboard). The pitch page's first viewport is a full-bleed 4:3 painting sized to cover the screen, with pins positioned as fractions of the painting so they stay on the same stone at every width. Two-column patterns pair copy with a sticky phone (content plus 330px phone; simulator 400px panel plus results). Breakpoints collapse to one column around 980px and 860px; on small screens the hero phone stacks under the map, pins shrink to numbered dots with a place list, and the tour thread opens in a bottom sheet.

## Elevation & Depth

Mostly flat paper with hairline borders. Depth comes from soft, negative-spread ink shadows that appear under things that float (phone, pins, panels) or that respond to hover. Paintings sit behind content and dissolve into the ground through gradient washes and masks.

### Shadow Vocabulary
- **Rest** (`0 1px 0 rgba(30,39,64,.08)`): buttons and feature tiles at rest.
- **Ledge** (`0 2px 0 #0d1326`, `0 4px 0` on hover): the key-cap base of a primary button, which disappears on press.
- **Lift** (`0 10px 18px -10px rgba(30,39,64,.5)`): hovered buttons, tiles, cards.
- **Float** (`0 12px 22px -14px rgba(30,39,64,.6)`): map pins.
- **Phone** (`0 30px 60px -30px rgba(30,39,64,.55)`): the phone and large sticky panels.

### Named Rules
**The Respond-Don't-Decorate Rule.** Static surfaces get a hairline, not a shadow; shadows grow only on objects that float or are being touched.

## Shapes

Generously rounded everywhere, scaled to object size: 6px tags, 12-14px buttons, 16px tiles, 18px bubbles with a 5px tail corner, 20-26px cards and panels, 46px phone, full pills for pins, chips, and tabs. Map pins and crew numerals are circles. Borders are 1px hairlines; the phone frame is a 10px ink border (8px in the sheet). Dashed ink lines (3px on, 5px off) draw the agent wiring.

## Components

### Buttons
Tactile and springy, identical on dashboard and site.
- **Shape:** gently rounded (14px; 12px small).
- **Primary:** ink fill, paper text, ink ledge beneath.
- **Secondary:** paper fill, hairline border, ink text.
- **Hover:** lift 2px on the spring curve (`transform .28s`), lift shadow, border darkens.
- **Press:** sink 1px and scale to .97 in 70ms with the shadow removed.
- **Focus:** 2px ink outline, 3px offset.

### Chips, Filters, Tabs
Paper pills with hairline borders (filters) or a tabs-well segmented control whose selected tab is a raised paper pill. Active filter inverts to ink. All scale to .95 on press.

### Cards / Containers
- **Corner Style:** 20-26px.
- **Background:** paper on cream; inset panels use panel.
- **Shadow Strategy:** hairline at rest; cards lift 4px with a -.4deg tilt on hover.
- **Selected:** a 1px inset ring and border in the owning crew color.

### The Phone
A 330px paper screen in a 10px ink frame with 46px corners and an ink pill notch. Header shows the agent's name; the thread scrolls with contained overscroll. Hero instances tilt -3deg, tour instances -2deg. Every replayed thread ends with the line "Example conversation, in Syl's real wording" and a Play again pill.

### Bubbles
Agent bubbles are bubble gray on the left with a small "who" line (crew dot plus name) above; student bubbles are iMessage blue on the right. 18px corners, 5px tail corner. Each new bubble pops in (`translateY(8px) scale(.96)` to rest, .45s settle). Typing dots bounce at 1s. Attachment, contact-card, and call pills share the bubble shapes.

### Map Pins and Painted Places
Pins are paper pills on the painting: a 28px circular numeral in the darkened crew color, a bold place name, and a muted descriptor. They drop in staggered on the spring curve, lift 3px on hover while the numeral scales 1.12 and rotates -6deg, and take a highlighter outline when their thread is playing. On small screens they collapse to the numeral alone. Painted places reuse the same paintings cropped and zoomed, faded with a radial mask, with a 34px numeral pin ringed in paper at the center.

### Motion Grammar
Two curves: **settle** (`cubic-bezier(.16,1,.3,1)`) for things that arrive (bubbles, panes, the phone, the headline highlighter sweep, underline grow) and **spring** (`cubic-bezier(.3,1.5,.5,1)`) for things you touch (buttons, pins, chips, cards). Presses are instant (70-80ms). Characters blink every 5.5s. Reduced motion collapses all animation and shows the highlighter already drawn.

## Do's and Don'ts

### Do:
- **Do** label every example thread and example data set on the surface itself ("Example conversation, in Syl's real wording", "Example data below"); never imply a replay is live.
- **Do** give each crew member its own color on every surface, darkened to 72% with black behind white numerals.
- **Do** use the spring curve for hover lift and a 70ms sink for press on anything clickable.
- **Do** fade paintings into the cream ground with washes and masks.
- **Do** keep tokens in sync across `apps/web`, `apps/site`, and `apps/cards`.

### Don't:
- **Don't** use the highlighter as a surface fill or a button color.
- **Don't** put Fraunces on buttons, pins, or labels.
- **Don't** add uppercase tracked labels above headings; headings stand on their own.
- **Don't** use glyph characters (arrows, check marks) as icons; draw them as SVG.
- **Don't** show live student data on the public site; it is examples only.
