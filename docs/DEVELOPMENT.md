# Local development

This is an English-language Astro static-site prototype. Home and Publications are the initial design samples; the other navigation destinations provide starter content. Value is reserved for content from Haihao.

## Run locally

Use Node 24 LTS (see `.nvmrc`), then:

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro, usually http://localhost:4321.

```sh
npm run check
npm run build
npm run preview
```

The static build is generated in `dist/`. Hosting and a production domain have not been configured. The current paths assume deployment at the domain root.

## Content and design

- `src/data/site.ts`: navigation, email, Google Scholar and official CV URL.
- `src/data/publications.json`: publication metadata and links. Use `published` or `preprint` for status and provide a verified year for each entry. All entries are grouped by year.
- `src/data/people.ts`: all migrated students and postdocs, grouped by current/alumni status and training category.
- `src/pages/index.astro`: homepage biography, research summaries, selected honors.
- `src/pages/value.astro`: placeholder for Haihao's text.
- `src/pages/research.astro`, `people.astro`, `software.astro`, `teaching.astro`: initial secondary pages.
- `src/styles/global.css`: shared typography, colors and responsive layouts.
- `docs/DESIGN-GUIDE.md`: the shared text roles, font sizes, spacing, and design references.
- `public/images/haihao-lu.webp`: official MIT portrait, served locally.

Publication search runs in the browser; the complete list and year navigation also work with JavaScript disabled. The mobile menu uses native HTML details/summary.

See `CONTENT-SOURCES.md` for source information and remaining editorial work. The original README guidance has been preserved.
