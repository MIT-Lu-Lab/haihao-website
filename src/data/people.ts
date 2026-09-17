// Migrated from Haihao's faculty Students page on 2026-09-16, and revised on
// 2026-09-16 to keep that page's abbreviations (MIT ORC, UChicago Booth, CMU
// Heinz) rather than expanding them. Where the source spells one department two
// ways — "UChicago Statistics Department" and "UChicago Stats" — it is normalised.
// Alumni status follows the explicit destination arrows on that page.
export type Person = {
  name: string;
  category: string;
  affiliation: string;
  /** Shown under the affiliation, e.g. a co-advisor. */
  note?: string;
  /** Where an alumnus went next. */
  destination?: string;
  alumni: boolean;
  /**
   * Personal or faculty page; the name becomes a link when set. Add one only
   * after checking it is current — a stale page is worse than no link.
   */
  link?: string;
};

export const people: Person[] = [
  { name: 'Charlie Liu', category: 'Doctoral students', affiliation: 'MIT ORC', note: 'Co-advised with Rahul Mazumder', alumni: false },
  { name: 'Nicolas Villena', category: 'Doctoral students', affiliation: 'MIT ORC', alumni: false },
  { name: 'Jacob Dentes', category: 'Doctoral students', affiliation: 'MIT ORC', alumni: false },
  { name: 'Zedong Peng', category: 'Postdoctoral researchers', affiliation: 'MIT', alumni: false },
  { name: 'Bo Tang', category: 'Postdoctoral researchers', affiliation: 'MIT', alumni: false },
  { name: 'Luke Fitzgerald', category: 'Undergraduate students', affiliation: 'MIT Math', alumni: false },
  { name: 'Jinwen Yang', category: 'Doctoral students', affiliation: 'UChicago Statistics', destination: 'Assistant Professor, Columbia University', alumni: true, link: 'https://jinwen-yang.github.io/' },
  { name: 'Azam Asl', category: 'Postdoctoral researchers', affiliation: 'UChicago Booth', destination: 'Consulting firm', alumni: true },
  { name: 'Baoyu Zhou', category: 'Postdoctoral researchers', affiliation: 'UChicago Booth', destination: 'Assistant Professor, Arizona University', alumni: true },
  { name: 'Feiyu Han', category: 'Master’s students', affiliation: 'UChicago Statistics', destination: 'PhD, UChicago Booth', alumni: true },
  { name: 'Luyang Zhang', category: 'Master’s students', affiliation: 'UChicago Applied Math', destination: 'PhD, CMU Heinz', alumni: true },
  { name: 'Hanyang Jiang', category: 'Master’s students', affiliation: 'UChicago Applied Math', destination: 'PhD, Georgia Tech ISE', alumni: true },
  { name: 'Yang Meng', category: 'Undergraduate students', affiliation: 'UChicago CS', destination: 'PhD, UChicago CS', alumni: true },
  { name: 'Wanyu Zhang', category: 'Undergraduate students', affiliation: 'Shanghai University of Finance and Economics', destination: 'PhD, Stanford MS&E', alumni: true },
  { name: 'Hongpei Li', category: 'Undergraduate students', affiliation: 'Shanghai University of Finance and Economics', destination: 'PhD, Northwestern IEMS', alumni: true },
];

export const categories = ['Doctoral students', 'Postdoctoral researchers', 'Master’s students', 'Undergraduate students'];
