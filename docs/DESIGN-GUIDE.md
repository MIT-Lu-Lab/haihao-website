# Design guide

This is Haihao Lu's academic personal website. The design should support reading research, finding publications, and learning about people. Keep the page hierarchy predictable and the text comfortably readable.

## References

- [USWDS typography](https://designsystem.digital.gov/components/typography/): readable body text, comfortable line length, and spacing that connects headings to the content they introduce.
- [IBM Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/): use named text roles consistently and distinguish display typography from content typography.

These references inform the principles. The values below are this site's choices, not a prescribed scale from either system.

## Typography

All sizes live as role-based CSS custom properties in `src/styles/global.css`. Values below assume the browser's default 16px root size; implementation uses rem so user font preferences remain effective.

| Role                        | Desktop | Mobile | Usage                                                              |
| --------------------------- | ------- | ------ | ------------------------------------------------------------------ |
| Display                     | 48px    | 40px   | Haihao's name on the homepage only                                 |
| Brand                       | 28px    | 28px   | Name in site navigation                                            |
| Page title                  | 36px    | 32px   | Research, People, Publications, etc.                               |
| Section heading             | 24px    | 24px   | Research interests, honors, research directions, publication years |
| Subheading                  | 20px    | 20px   | Research summaries and people categories                           |
| Body                        | 18px    | 16px   | Biography, research text, publication titles, people names         |
| Interface / supporting text | 16px    | 16px   | Navigation, authors, venues, contact information                   |
| Metadata                    | 14px    | 14px   | Short captions and less prominent links                            |
| Label                       | 12px    | 12px   | Short status badges and eyebrow labels only                        |

- Use the system sans-serif family for content, headings, and navigation. Content headings use weight 600. Keep Georgia for the personal name/wordmark only.
- Keep body line height at 1.7 and headings around 1.3. Do not enlarge headings to compensate for weak layout.
- Long-form text uses a maximum measure of 70ch; lists and multi-column layouts may use the wider grid. `ch` is an approximate measure, not a guarantee of an exact character count.
- Equivalent roles share a size. For example, Research interests and Selected honors are both section headings.
- Avoid page-specific or breakpoint-specific font-size overrides. Adjust the shared role tokens when a change should affect the whole site.

## Layout and spacing

- Keep the burgundy site header compact, at approximately 80px tall. The current navigation item has a white underline.
- The overall container is capped at 1248px including gutters. Use the narrower reading measure for prose.
- Research uses text and figure columns in a 1.05:1 ratio, with a gap from 28px to 56px. Sections stack at widths of 760px or less. On wider screens, figures are sticky when the viewport is at least 720px tall. Check all four figures when changing this layout.
- Use the spacing scale: 8, 12, 16, 24, 32, 48, and 64px. Section headings sit closer to their own text than to the previous section.
- Use larger gaps between sections and smaller gaps within related information. Avoid oversized empty hero areas on content pages.
- On narrower screens, stack columns and wrap navigation rather than shrinking all text to fit.

## Color and detail

- Burgundy `#750014` is the primary accent; white is the main background.
- Main text is `#26272b`; secondary text is `#595b61`. Small labels should remain legible.
- Use thin rules to separate content. Avoid extra cards, category numbers, or repeated subtitles when headings already explain the structure.
- Do not repeat “Haihao Lu · MIT Sloan” above each page title.

## Research figures

Use these conventions when editing or adding Research figures.

- Color: use `--red` for the primary series, `--chart-baseline` for the comparison gray, and `--chart-emphasis` for the dark neutral series. Use `--muted` and `--ink` for labels. Define additional accents on the component root.
- Type: check SVG text at its rendered size on narrow screens. Use shared text tokens for HTML labels.
- Motion: use `src/lib/research/playback.ts` for autoplay, visibility handling, and a static state under `prefers-reduced-motion`.
- Text alternatives: give SVG figures a short `<title>` and a `<desc>` explaining the data and comparison. Connect canvas figures to a descriptive caption with `aria-describedby`. Cite sources and photo licenses.
- Structure: keep markup in `src/components`, animation logic in `src/lib/research`, data in `data/research` or `public`, and tests in `test`. Share coordinates between markup and scripts. Store research photos in `src/assets/research` and render them through `astro:assets`. Record sources in `data/research/image-sources.json`.

## Review checklist

- Review Home, Research, Publications, and People together, on desktop and mobile.
- Check long heading wrapping, long author lists, and the largest navigation widths.
- Verify keyboard focus, native mobile navigation, and the no-JavaScript publication fallback.
- Preserve the original content requirements: no news feed; Value remains reserved for Haihao; migrated content lives on this site.
