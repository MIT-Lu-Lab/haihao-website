# Design guide

This is Haihao Lu's academic personal website. The design should support reading research, finding publications, and learning about people. Keep the page hierarchy predictable and the text comfortably readable.

## References

- [USWDS typography](https://designsystem.digital.gov/components/typography/): readable body text, comfortable line length, and spacing that connects headings to the content they introduce.
- [IBM Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/): use named text roles consistently and distinguish display typography from content typography.

These references inform the principles. The values below are this site's choices, not a prescribed scale from either system.

## Typography

All sizes live as role-based CSS custom properties in `src/styles/global.css`. Values below assume the browser's default 16px root size; implementation uses rem so user font preferences remain effective.

| Role | Desktop | Mobile | Usage |
| --- | --- | --- | --- |
| Display | 48px | 40px | Haihao's name on the homepage only |
| Brand | 28px | 28px | Name in site navigation |
| Page title | 36px | 32px | Research, People, Publications, etc. |
| Section heading | 24px | 24px | Research interests, honors, research directions, publication years |
| Subheading | 20px | 20px | Research summaries and people categories |
| Body | 18px | 16px | Biography, research text, publication titles, people names |
| Interface / supporting text | 16px | 16px | Navigation, authors, venues, contact information |
| Metadata | 14px | 14px | Short captions and less prominent links |
| Label | 12px | 12px | Short status badges and eyebrow labels only |

- Use the system sans-serif family for content, headings, and navigation. Content headings use weight 600. Keep Georgia for the personal name/wordmark only.
- Keep body line height at 1.7 and headings around 1.3. Do not enlarge headings to compensate for weak layout.
- Long-form text uses a maximum measure of 70ch; lists and multi-column layouts may use the wider grid. `ch` is an approximate measure, not a guarantee of an exact character count.
- Equivalent roles share a size. For example, Research interests and Selected honors are both section headings.
- Avoid page-specific or breakpoint-specific font-size overrides. Adjust the shared role tokens when a change should affect the whole site.

## Layout and spacing

- Keep the burgundy site header compact, at approximately 80px tall. The current navigation item has a white underline.
- The overall container is capped at 1248px including gutters. Use the narrower reading measure for prose.
- Research uses the full content grid: an introductory paragraph spans the width, followed by two equal research-direction columns. At 760px and below, the directions stack vertically.
- Use the spacing scale: 8, 12, 16, 24, 32, 48, and 64px. Section headings sit closer to their own text than to the previous section.
- Use larger gaps between sections and smaller gaps within related information. Avoid oversized empty hero areas on content pages.
- On narrower screens, stack columns and wrap navigation rather than shrinking all text to fit.

## Color and detail

- Burgundy `#750014` is the primary accent; white is the main background.
- Main text is `#26272b`; secondary text is `#595b61`. Small labels should remain legible.
- Use thin rules to separate content. Avoid extra cards, category numbers, or repeated subtitles when headings already explain the structure.
- Do not repeat “Haihao Lu · MIT Sloan” above each page title.

## Review checklist

- Review Home, Research, Publications, and People together, on desktop and mobile.
- Check long heading wrapping, long author lists, and the largest navigation widths.
- Verify keyboard focus, native mobile navigation, and the no-JavaScript publication fallback.
- Preserve the original content requirements: no news feed; Value remains reserved for Haihao; migrated content lives on this site.
