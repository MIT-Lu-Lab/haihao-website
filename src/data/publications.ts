import source from './publications.bib?raw';
import { parsePublications, type Publication } from './bibtex.ts';

export const publications: Publication[] = parsePublications(source);

export type { Publication, Author, Link, PublicationStatus } from './bibtex.ts';
