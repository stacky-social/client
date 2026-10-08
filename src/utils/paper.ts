/**
 * The research paper this UI demo accompanies. Fill these in once the arXiv
 * preprint is public: the "UI demo" badge and the landing-page citation link
 * to `url` and render `citation` / `bibtex` automatically.
 */
export const PAPER = {
  /** e.g. "https://arxiv.org/abs/2610.01234" — empty until published. */
  url: "https://arxiv.org/abs/2610.10441",
  /** Short human-readable citation shown on the landing page. */
  citation:
    "Fang et al. (2026). CrossWeave: Bridging Perspectives Across Online Communities with a Dual-Pane Design. arXiv:2610.10441.",
  /** Optional BibTeX entry, offered as a copy button on the landing page. */
  bibtex: `@misc{fang2026crossweave,
  title={CrossWeave: Bridging Perspectives Across Online Communities with a Dual-Pane Design},
  author={Fang, Fei and others},
  year={2026},
  eprint={2610.10441},
  archivePrefix={arXiv}
}`,
};

export const hasPaperLink = () => PAPER.url.trim().length > 0;
