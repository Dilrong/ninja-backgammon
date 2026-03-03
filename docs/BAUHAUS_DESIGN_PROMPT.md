# Bauhaus Design Prompt

This repository follows a Bauhaus visual system for all gameplay and UI surfaces.

## Core Direction

- Form follows function.
- Geometry first: circles, squares, triangles.
- Strong primary palette only: red, blue, yellow, black, white.
- Hard borders and hard shadows.
- Mechanical motion, not soft motion.

## Design Tokens

- Background: `#F0F0F0`
- Foreground and border: `#121212`
- Primary Red: `#D02020`
- Primary Blue: `#1040C0`
- Primary Yellow: `#F0C020`
- Muted: `#E0E0E0`

Typography:

- Font family: `Outfit` (`400, 500, 700, 900`) preferred for display and body.
- Headlines: uppercase, heavy weight, tight tracking.
- Labels: uppercase, wide tracking, bold.

Shape and border:

- Radius policy: only `0` or full circle.
- Borders: `2px` mobile, `4px` desktop for major blocks.
- Border color: black only.

Shadows:

- Use hard offset shadows only, no blur.
- Typical offsets: `4px`, `6px`, `8px`.

## Composition Rules

- Use color-blocked sections, not subtle gradients.
- Keep asymmetric balance with intentional offsets.
- Include geometric decorative accents in corners and backgrounds.
- Keep UI direct and declarative.

## Components

Buttons:

- Color variants: red, blue, yellow, white outline.
- Uppercase labels, bold, hard border, hard shadow.
- Press behavior: translate and drop shadow.

Cards and panels:

- White or primary color surfaces.
- Thick black borders and hard shadows.
- Small geometric accent in a corner when appropriate.

Board UI:

- Must read as a composed geometric board, not a generic grid.
- Triangular points are required.
- Center bar lane and off lane must be explicit and structural.

## Motion

- Short and snappy transitions (`200-300ms`).
- Mechanical easing.
- Allowed interactions: lift, press-down, rotation, pulse.
- Avoid organic spring-like motion.

## Responsive Behavior

- Mobile-first layouts.
- Reduce border and shadow scale on small screens.
- Keep geometric hierarchy visible at every breakpoint.

## Non-Negotiables

- No soft blur shadows.
- No random pastel palette.
- No rounded corners except full circles.
- No generic bootstrap-like panel styling.

## Repository Usage

When implementing or refactoring UI in this repo:

1. Reuse existing token variables in `src/app/globals.css`.
2. Keep naming and component structure consistent.
3. Prefer reusable classes over one-off inline styles.
4. Validate mobile and desktop layouts before completion.
