export type Contribution = { category: string; probability?: number };
export function selectWinningRelation<T extends Contribution>(items: T[], preferredCategory?: string | null, filterCategories?: Set<string>): T | null;
export function chooseContribution<T extends Contribution>(items: T[], options?: { hoveredCategory?: string | null; filterCategories?: Set<string> }): T | null;
export function contributionSegments<T extends { contentStart: number; contentEnd: number }>(relations: T[], textLength: number): Array<{ start: number; end: number; contributors: Array<T & { index: number }> }>;
