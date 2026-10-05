/**
 * The research paper this UI demo accompanies. Fill these in once the arXiv
 * preprint is public: the "UI demo" badge and the landing-page citation link
 * to `url` and render `citation` / `bibtex` automatically.
 */
export const PAPER = {
  /** e.g. "https://arxiv.org/abs/2610.01234" — empty until published. */
  url: "",
  /** Short human-readable citation shown on the landing page. */
  citation: "",
  /** Optional BibTeX entry, offered as a copy button on the landing page. */
  bibtex: "",
};

export const hasPaperLink = () => PAPER.url.trim().length > 0;
