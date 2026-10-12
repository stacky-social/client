import type { Relation } from '../types/PostType';
export function canonicalThreadPost<T extends { content: string; rewrite?: { originalContent?: string } }>(post: T): T & { plainText?: string };
export function projectThreadRelations(source: string, target: string, relations: Relation[]): Relation[];
