import { parse } from '@retorquere/bibtex-parser';

export type PublicationStatus = 'published' | 'preprint';

export type Author = {
  name: string;
  isSelf: boolean;
};

export type Link = {
  label: string;
  url: string;
};

export type Publication = {
  id: string;
  title: string;
  authors: Author[];
  venue: string;
  year: number;
  status: PublicationStatus;
  links: Link[];
};

/**
 * Parse without the parser's editorial defaults: `sentenceCase` would rewrite
 * "cuPDLP.jl: A GPU Implementation" as "cupdlp.jl: a GPU implementation", and
 * `caseProtection` wraps braced words in <span class="nocase"> markup. Titles
 * are shown exactly as the .bib records them.
 */
const PARSE_OPTIONS = { sentenceCase: false, caseProtection: false } as const;

const SELF = { firstName: 'Haihao', lastName: 'Lu' };

const UNDER_REVIEW = 'Under review';

type ParsedName = { firstName?: string; lastName?: string; name?: string };

const compose = (text: string) => text.normalize('NFC');

function toAuthor(name: ParsedName): Author {
  if (!name.firstName && name.lastName === 'others') return { name: 'et al.', isSelf: false };

  const full = [name.firstName, name.lastName].filter(Boolean).join(' ');
  return {
    name: compose(full || (name.name ?? '')),
    isSelf: name.firstName === SELF.firstName && name.lastName === SELF.lastName,
  };
}

const EXTRA_LINK_FIELDS: [field: string, label: string][] = [
  ['code', 'Code'],
  ['supplement', 'Supplemental Material'],
  ['ssrn', 'SSRN'],
  ['conference', 'Conference Paper'],
  ['pdf', 'Preprint PDF'],
];

function toLinks(fields: Record<string, unknown>): Link[] {
  const links: Link[] = [];
  const doi = fields.doi as string | undefined;
  const url = fields.url as string | undefined;

  if (doi) links.push({ label: 'Paper', url: `https://doi.org/${doi}` });
  else if (url) links.push({ label: 'Paper', url });

  const eprint = fields.eprint as string | undefined;
  if (eprint && (fields.archiveprefix as string | undefined)?.toLowerCase() === 'arxiv') {
    links.push({ label: 'arXiv', url: `https://arxiv.org/abs/${eprint}` });
  }

  for (const [field, label] of EXTRA_LINK_FIELDS) {
    const value = fields[field] as string | undefined;
    if (value) links.push({ label, url: value });
  }

  return links;
}

export function parsePublications(source: string): Publication[] {
  const { entries } = parse(source, PARSE_OPTIONS);

  return entries.map(entry => {
    const status: PublicationStatus = entry.type === 'unpublished' ? 'preprint' : 'published';
    const venue = entry.fields.journal ?? entry.fields.booktitle ?? UNDER_REVIEW;

    return {
      id: entry.key,
      title: compose(entry.fields.title as string),
      authors: ((entry.fields.author ?? []) as ParsedName[]).map(toAuthor),
      venue: compose(venue as string),
      year: Number(entry.fields.year),
      status,
      links: toLinks(entry.fields as Record<string, unknown>),
    };
  });
}
