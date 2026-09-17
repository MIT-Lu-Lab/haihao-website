import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublications } from '../src/data/bibtex.ts';

test('@article is published and uses journal as venue', () => {
  const [paper] = parsePublications(`
    @article{lu2025cupdlp,
      title = {cuPDLP.jl: A GPU Implementation of Restarted PDHG in {Julia}},
      author = {Lu, Haihao and Jinwen Yang},
      journal = {Operations Research},
      year = {2025},
    }
  `);

  assert.equal(paper.status, 'published');
  assert.equal(paper.venue, 'Operations Research');
  assert.equal(paper.year, 2025);
  assert.equal(paper.id, 'lu2025cupdlp');
});

test('@unpublished is a preprint shown as under review', () => {
  const [paper] = parsePublications(`
    @unpublished{lu2026new,
      title = {A New Method},
      author = {Lu, Haihao},
      year = {2026},
    }
  `);

  assert.equal(paper.status, 'preprint');
  assert.equal(paper.venue, 'Under review');
});

test('title casing and math are preserved verbatim', () => {
  const [paper] = parsePublications(`
    @article{lu2024geometry,
      title = {On the Geometry of PDHG with $O(1/k)$ Rate},
      author = {Lu, Haihao},
      journal = {Mathematical Programming},
      year = {2024},
    }
  `);

  assert.equal(paper.title, 'On the Geometry of PDHG with O(1/k) Rate');
});

const authorsOf = (authorField) => {
  const [paper] = parsePublications(
    `@article{k, title={T}, author = {${authorField}}, journal={J}, year={2020}}`
  );
  return paper.authors;
};

test('both BibTeX name forms render as "First Last"', () => {
  assert.deepEqual(authorsOf('Lu, Haihao and Jinwen Yang'), [
    { name: 'Haihao Lu', isSelf: true },
    { name: 'Jinwen Yang', isSelf: false },
  ]);
});

test('source author order is preserved', () => {
  assert.deepEqual(authorsOf('Liu, Tianhao and Haihao Lu'), [
    { name: 'Tianhao Liu', isSelf: false },
    { name: 'Haihao Lu', isSelf: true },
  ]);
});

test('LaTeX accents become Unicode', () => {
  assert.deepEqual(authorsOf('Sch\\"{o}lkopf, Bernhard'), [
    { name: 'Bernhard Schölkopf', isSelf: false },
  ]);
});

const linksOf = (fields) => {
  const [paper] = parsePublications(
    `@article{k, title={T}, author={Lu, Haihao}, journal={J}, year={2020}, ${fields}}`
  );
  return paper.links;
};

test('a DOI becomes the Paper link', () => {
  assert.deepEqual(linksOf('doi = {10.1287/opre.2024.1069}'), [
    { label: 'Paper', url: 'https://doi.org/10.1287/opre.2024.1069' },
  ]);
});

test('url is the Paper link when there is no DOI', () => {
  assert.deepEqual(linksOf('url = {https://proceedings.mlr.press/v80/lu18a.html}'), [
    { label: 'Paper', url: 'https://proceedings.mlr.press/v80/lu18a.html' },
  ]);
});

test('an eprint becomes an arXiv link after the Paper link', () => {
  assert.deepEqual(
    linksOf('doi = {10.1287/opre.2024.1069}, eprint = {2311.12180}, archiveprefix = {arXiv}'),
    [
      { label: 'Paper', url: 'https://doi.org/10.1287/opre.2024.1069' },
      { label: 'arXiv', url: 'https://arxiv.org/abs/2311.12180' },
    ]
  );
});

test('a working paper with only an eprint leads with arXiv', () => {
  const [paper] = parsePublications(
    `@unpublished{k, title={T}, author={Lu, Haihao}, year={2026}, eprint={2507.14051}, archiveprefix={arXiv}}`
  );
  assert.deepEqual(paper.links, [{ label: 'arXiv', url: 'https://arxiv.org/abs/2507.14051' }]);
});

test('code and supplement fields become trailing links', () => {
  assert.deepEqual(
    linksOf('doi = {10.1/x}, code = {https://github.com/o/r}, supplement = {https://pubsonline.informs.org/s}'),
    [
      { label: 'Paper', url: 'https://doi.org/10.1/x' },
      { label: 'Code', url: 'https://github.com/o/r' },
      { label: 'Supplemental Material', url: 'https://pubsonline.informs.org/s' },
    ]
  );
});

test('an arXiv DOI is recorded as an eprint, not a second Paper link', () => {
  assert.deepEqual(linksOf('eprint = {2407.19689}, archiveprefix = {arXiv}'), [
    { label: 'arXiv', url: 'https://arxiv.org/abs/2407.19689' },
  ]);
});

test('one-off venue links keep their own labels', () => {
  assert.deepEqual(
    linksOf('doi={10.1/x}, ssrn={https://papers.ssrn.com/a}, conference={https://proceedings.mlr.press/b}, pdf={https://mitsloan.mit.edu/c}'),
    [
      { label: 'Paper', url: 'https://doi.org/10.1/x' },
      { label: 'SSRN', url: 'https://papers.ssrn.com/a' },
      { label: 'Conference Paper', url: 'https://proceedings.mlr.press/b' },
      { label: 'Preprint PDF', url: 'https://mitsloan.mit.edu/c' },
    ]
  );
});

test('"and others" renders as et al.', () => {
  assert.deepEqual(authorsOf('Aggarwal, Gagan and others'), [
    { name: 'Gagan Aggarwal', isSelf: false },
    { name: 'et al.', isSelf: false },
  ]);
});
