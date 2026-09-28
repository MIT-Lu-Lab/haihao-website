import { sitePath } from '../utils/paths';

export const allowSearchEngines = false;

export const profile = {
  name: 'Haihao Lu',
  email: 'haihao@mit.edu',
  scholar: 'https://scholar.google.com/citations?user=DnRJBwUAAAAJ&hl=en',
  faculty: 'https://mitsloan.mit.edu/faculty/directory/haihao-lu',
  github: 'https://github.com/MIT-Lu-Lab',
  cv: sitePath('files/HaihaoLu_CV_Sep_26.pdf'),
  advisingPhilosophy: sitePath('files/advising_philosophy.pdf'),
  assistant: { name: 'Kelsey Gintzler', email: 'klgintz@mit.edu' },
};

export const isExternal = (href: string) => /^https?:\/\//.test(href);

export const navigation = [
  { label: 'Home', href: sitePath() },
  { label: 'Research', href: sitePath('research/') },
  { label: 'Thoughts', href: sitePath('thoughts/') },
  { label: 'Publications', href: sitePath('publications/') },
  { label: 'People', href: sitePath('people/') },
  { label: 'Software', href: sitePath('software/') },
  { label: 'Teaching', href: sitePath('teaching/') },
  { label: 'CV', href: profile.cv },
];
