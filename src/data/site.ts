export const allowSearchEngines = false;

export const profile = {
  name: 'Haihao Lu',
  email: 'haihao@mit.edu',
  scholar: 'https://scholar.google.com/citations?user=DnRJBwUAAAAJ&hl=en',
  faculty: 'https://mitsloan.mit.edu/faculty/directory/haihao-lu',
  cv: 'https://mitsloan.mit.edu/shared/ods/documents/?DocumentID=14396&doc=1',
  assistant: { name: 'Kelsey Gintzler', email: 'klgintz@mit.edu' },
};

export const isExternal = (href: string) => /^https?:\/\//.test(href);

export const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Research', href: '/research/' },
  { label: 'Thoughts', href: '/thoughts/' },
  { label: 'Publications', href: '/publications/' },
  { label: 'People', href: '/people/' },
  { label: 'Software', href: '/software/' },
  { label: 'Teaching', href: '/teaching/' },
  { label: 'CV', href: profile.cv },
];
