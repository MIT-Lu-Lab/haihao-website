import source from './publications.bib?raw';
import { parsePublications, type Publication } from './bibtex.ts';

/**
 * `publications.bib` is the single source of truth. It is parsed at build time,
 * so adding a paper means pasting its BibTeX entry into that file — nothing here
 * or on the Publications page needs to change.
 */
export const publications: Publication[] = parsePublications(source);

export type { Publication, Author, Link, PublicationStatus } from './bibtex.ts';
