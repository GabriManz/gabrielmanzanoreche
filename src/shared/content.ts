/**
 * Single source of truth for site content, shared by every concept.
 *
 * RULE: only facts Gabriel supplied in the brief are written as facts.
 * Everything else is a clearly marked placeholder (`placeholder: true` or a
 * string starting with "[Placeholder"). Never invent publications, awards,
 * results or biographical details here.
 */

export interface Item {
  title: string;
  body: string;
  placeholder?: boolean;
  href?: string;
}

export const person = {
  name: 'Gabriel Manzano Reche',
  short: 'Gabriel',
  role: 'PhD researcher in Biomedical Engineering',
  affiliation: 'Universitat Politècnica de Catalunya (UPC) · IIBB-CSIC, Barcelona',
  tagline: 'Computational tools for reading the electrical life of the heart, one calcium spark at a time.',
  github: 'https://github.com/GabriManz',
  email: '[Placeholder: contact email]',
};

export const research: Item[] = [
  {
    title: 'Calcium signalling & arrhythmia',
    body: 'Intracellular Ca²⁺ handling in cardiomyocytes, ryanodine receptors (RyR2), calcium sparks and spontaneous calcium release as mechanisms behind cardiac arrhythmias.',
  },
  {
    title: 'Biomedical image analysis',
    body: 'Confocal microscopy, segmentation and automated quantification of biological images using computer vision and deep learning.',
  },
  {
    title: 'Towards personalised medicine',
    body: 'Doctoral goal: connect cellular phenotypes, genetic variation and clinical information to better understand arrhythmia severity and, potentially, improve personalised treatment.',
  },
];

export const projects: Item[] = [
  {
    title: '[Placeholder] Calcium-spark detection pipeline',
    body: 'Illustrative slot for an image-analysis tool. Real name, description and repository link to be supplied by Gabriel.',
    placeholder: true,
  },
  {
    title: '[Placeholder] Segmentation / quantification toolkit',
    body: 'Illustrative slot for a deep-learning segmentation project. Details to be supplied.',
    placeholder: true,
  },
  {
    title: '[Placeholder] AI-agent & open-source experiments',
    body: 'Illustrative slot for software experiments with AI agents. Details to be supplied.',
    placeholder: true,
  },
];

export const publications: Item[] = [
  {
    title: '[Placeholder] Publications',
    body: 'No publications are listed yet. Add real, verified references only.',
    placeholder: true,
  },
];

export const about: Item[] = [
  {
    title: 'Scientist · engineer · creative technologist',
    body: 'Working at the intersection of biology, artificial intelligence, engineering and software development. Mostly Python.',
  },
  {
    title: 'Off the bench',
    body: 'Running, CrossFit and endurance sport; travelling and discovering new cultures; explaining complex scientific ideas.',
  },
];

export const sections = {
  research: { label: 'Research', items: research },
  projects: { label: 'Projects', items: projects },
  about: { label: 'About', items: about },
  contact: {
    label: 'Contact',
    items: [
      { title: 'GitHub', body: person.github, href: person.github },
      { title: 'Email', body: person.email, placeholder: true },
    ] as Item[],
  },
} as const;

export type SectionKey = keyof typeof sections;
