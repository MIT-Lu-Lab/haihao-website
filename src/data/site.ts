/**
 * While this is false, every page carries a noindex tag and robots.txt disallows
 * crawling, so the review deployment cannot turn up in search results alongside
 * Haihao's official MIT page. Set it to true when the site goes live at its real
 * domain — that one change is all that is needed.
 */
export const allowSearchEngines = false;

export const profile = {
  name: 'Haihao Lu',
  email: 'haihao@mit.edu',
  scholar: 'https://scholar.google.com/citations?user=DnRJBwUAAAAJ&hl=en',
  faculty: 'https://mitsloan.mit.edu/faculty/directory/haihao-lu',
  cv: 'https://mitsloan.mit.edu/shared/ods/documents/?DocumentID=14396&doc=1',
  assistant: { name: 'Kelsey Gintzler', email: 'klgintz@mit.edu' },
};

/** A link that leaves the site, and so opens in a new tab. */
export const isExternal = (href: string) => /^https?:\/\//.test(href);

export const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Research', href: '/research/' },
  { label: 'Value', href: '/value/' },
  { label: 'Publications', href: '/publications/' },
  { label: 'People', href: '/people/' },
  { label: 'Software', href: '/software/' },
  { label: 'Teaching', href: '/teaching/' },
  { label: 'CV', href: profile.cv },
];
