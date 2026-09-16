# Content sources and editorial follow-up

Initial import: 2026-09-16. This is a visual prototype, not a claim that all publication metadata has been reconciled against publishers.

## Sources

- Biography and research: https://mitmgmtfaculty.mit.edu/hlu/
- Position, contact details, honors, and portrait: https://mitsloan.mit.edu/faculty/directory/haihao-lu
- Publication metadata and paper links: https://mitmgmtfaculty.mit.edu/hlu/research-publications/
- People content: https://mitmgmtfaculty.mit.edu/hlu/students/
- CV and historical teaching information: https://mitsloan.mit.edu/shared/ods/documents/?DocumentID=14396&doc=1
- Portrait asset: https://mitsloan.mit.edu/sites/default/files/styles/profile_detail_headshot/public/profile-images/2026/08/17/profile-image-93071.png.webp?h=fbf7a813&itok=w7l33MTu

The introductory prose is an editorial first-person draft based on these public profiles. Haihao should review the wording before publication.

## Import decisions

- Use the publication list's formal publication status rather than the older featured-paper labels on the existing homepage.
- Merge the duplicate working-paper entry for “Regularized Online Allocation Problems: Fairness and Beyond” into its published entry, retaining any distinct links.
- Group all papers by year; do not show a separate Forthcoming section or badge. “A New Crossover Algorithm for LP Inspired by the Spiral Dynamic of PDHG” is listed under 2026 as published, following the [publisher's online publication date of April 6, 2026](https://pubsonline.informs.org/doi/abs/10.1287/ijoc.2024.0996).
- Normalize DOI URLs to HTTPS and the `cuPDLP.jl` spelling.
- Preserve source author order and wording. Publication volumes and page ranges are not displayed in this initial layout.
- Reconcile the year of “On the Geometry and Refined Rate of Primal-Dual Hybrid Gradient for Linear Programming” to 2025, following the linked CV's final volume citation rather than the publication page's earlier 2024 listing.
- Migrate all 15 people and administrative-support contact information into the new People page. Current/alumni classification follows explicit destination arrows in the source. Retain the source's “Arizona University” wording pending confirmation of the institution name.

## Remaining content work

- Value: Haihao will supply the content; keep the label exactly “Value”.
- Publications: verify current preprint/acceptance status, author formatting, and source typography (especially mathematical notation) against publisher/arXiv records or an authoritative BibTeX export.
- People: confirm current affiliations and alumni destinations, particularly the source's ambiguous “Arizona University” wording. Optional photographs can be added later.
- Software: add confirmed repository and documentation URLs, project descriptions, and the full set of desired projects.
- Teaching: confirm newer course offerings and add public course-material links. Listed dates are historical dates from the CV, not a current teaching schedule.
- CV: the navigation currently opens MIT's hosted PDF. Switch to a local approved PDF if desired.
- Confirm the hosting domain, then add canonical URLs, social-sharing image metadata, and a sitemap.

No news feed, analytics, deployment, or publishing is included in this prototype.
