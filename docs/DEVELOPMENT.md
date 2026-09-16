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
npm test
npm run check
npm run build
npm run preview
```

The static build is generated in `dist/`. Hosting and a production domain have not been configured. The current paths assume deployment at the domain root.

## Adding a publication

Paste the paper's BibTeX entry into `src/data/publications.bib`. Publishers,
arXiv and Google Scholar all export it, so the entry rarely needs to be typed by
hand. Nothing else needs to change: the links, the year grouping and the author
formatting are all derived at build time.

```bibtex
@article{lu2027example,
  title         = {A Paper Title, Capitalised Exactly As It Should Appear},
  author        = {Lu, Haihao and Jinwen Yang},
  journal       = {Mathematical Programming},
  year          = {2027},
  doi           = {10.1007/xxxxx},
  eprint        = {2701.12345},
  archiveprefix = {arXiv},
}
```

The entry type sets how the paper is presented:

| Entry type | Venue field | Shown as |
| --- | --- | --- |
| `@article` | `journal` | the journal name |
| `@inproceedings` | `booktitle` | the proceedings name |
| `@unpublished` | none | "Under review" |

Links are built from the fields, so record identifiers rather than URLs:

| Field | Becomes | Note |
| --- | --- | --- |
| `doi` | "Paper" | bare DOI, not a `doi.org` URL |
| `url` | "Paper" | only for venues with no DOI, such as PMLR |
| `eprint` + `archiveprefix = {arXiv}` | "arXiv" | bare id, e.g. `2409.14715` |
| `code` | "Code" | repository URL |
| `supplement`, `ssrn`, `conference`, `pdf` | their own labels | one-off extras |

Titles appear exactly as written, so capitalise them the way they should read.
Haihao's name is detected and emphasised automatically. Run `npm test` after
editing; it checks the file still parses and that the derived links are right.

## Content and design

- `src/data/site.ts`: navigation, email, Google Scholar and official CV URL.
- `src/data/publications.bib`: every publication, in BibTeX. This is the only file to edit when the publication list changes; see "Adding a publication" below.
- `src/data/bibtex.ts`: turns that BibTeX into the data the pages render. Covered by `npm test`.
- `src/data/people.ts`: all migrated students and postdocs, grouped by current/alumni status and training category.
- `src/data/software.ts`: the repositories listed on the Software page, each with a name, a one-line description and a GitHub URL.
- `src/pages/index.astro`: homepage biography, research summaries, selected honors.
- `src/pages/value.astro`: placeholder for Haihao's text.
- `src/pages/research.astro`, `people.astro`, `software.astro`, `teaching.astro`: secondary pages. Research reads as a single column; Software lays its repositories out in a two-column grid.
- `src/styles/global.css`: shared typography, colors and responsive layouts.
- `docs/DESIGN-GUIDE.md`: the shared text roles, font sizes, spacing, and design references.
- `public/images/haihao-lu.webp`: official MIT portrait, served locally.

Publication search runs in the browser; the complete list and year navigation also work with JavaScript disabled. The mobile menu uses native HTML details/summary.

See `CONTENT-SOURCES.md` for source information and remaining editorial work. The original README guidance has been preserved.
