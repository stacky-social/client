function tokenize(text) {
  return text.match(/\s+|[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s]/gu) ?? [];
}

function compact(parts) {
  const chunks = [];
  for (const part of parts) {
    const previous = chunks[chunks.length - 1];
    if (previous?.kind === part.kind) previous.text += part.text;
    else chunks.push({ ...part });
  }
  return chunks;
}

const TRIVIAL_CONTEXT_WORDS = new Set(["a", "an", "the"]);

/**
 * Reduce prose to the lexical content that merits an AI provenance treatment.
 * Typography, punctuation, whitespace, capitalization, article swaps, and a
 * removed @mention are useful cleanup, but not useful enough to interrupt the
 * reader with a "Modified by AI" disclosure.
 */
function substantiveFingerprint(text) {
  return (text ?? "")
    .normalize("NFKC")
    .replace(/(^|\s)@[\p{L}\p{N}_.@-]+/gu, " ")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
    ?.filter((word) => !TRIVIAL_CONTEXT_WORDS.has(word))
    .join("") ?? "";
}

/** True when a rewrite changes lexical meaning rather than surface form. */
export function isSubstantiveWordDiff(original, revised) {
  return substantiveFingerprint(original) !== substantiveFingerprint(revised);
}

/** Complete word-level LCS diff. The non-delete chunks reconstruct `revised`. */
export function createWordDiff(original, revised) {
  const before = tokenize(original);
  const after = tokenize(revised);
  const rows = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));

  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      rows[i][j] = before[i] === after[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const parts = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      parts.push({ kind: "equal", text: before[i] });
      i++;
      j++;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) {
      parts.push({ kind: "delete", text: before[i++] });
    } else {
      parts.push({ kind: "insert", text: after[j++] });
    }
  }
  while (i < before.length) parts.push({ kind: "delete", text: before[i++] });
  while (j < after.length) parts.push({ kind: "insert", text: after[j++] });

  return compact(parts);
}

/** Word-level LCS diff with surrounding context, suitable for a track-changes preview. */
export function createWordDiffExcerpt(original, revised, maxTokens = 100) {
  const parts = createWordDiff(original, revised);

  const firstChange = parts.findIndex((part) => part.kind !== "equal");
  let lastChange = -1;
  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index].kind !== "equal") { lastChange = index; break; }
  }
  if (firstChange < 0) return [{ kind: "equal", text: revised }];

  const context = Math.max(12, Math.floor(maxTokens / 3));
  const start = Math.max(0, firstChange - context);
  const end = Math.min(parts.length, Math.max(lastChange + context + 1, start + maxTokens));
  const excerpt = parts.slice(start, Math.min(end, start + maxTokens));
  if (start > 0) excerpt.unshift({ kind: "equal", text: "… " });
  if (end < parts.length || start + maxTokens < parts.length) excerpt.push({ kind: "equal", text: " …" });
  return compact(excerpt);
}

/**
 * Returns original and tracked-edit slices covering the same semantic window.
 * Deleted text remains in the tracked layer and insertions are additive, so the
 * tracked layer can never contain less reading material than the original.
 */
export function createAlignedWordDiffWindow(original, revised, maxOriginalChars = 280) {
  if (original === revised) {
    const originalEnd = Math.min(original.length, maxOriginalChars);
    return {
      originalText: original.slice(0, originalEnd),
      revisedText: revised.slice(0, originalEnd),
      chunks: [{ kind: "equal", text: revised.slice(0, originalEnd) }],
      originalStart: 0,
      originalEnd,
      revisedStart: 0,
      revisedEnd: originalEnd,
      hasPrefix: false,
      hasSuffix: originalEnd < original.length,
    };
  }

  let changeStart = 0;
  while (
    changeStart < original.length
    && changeStart < revised.length
    && original[changeStart] === revised[changeStart]
  ) changeStart++;

  let sharedSuffix = 0;
  while (
    sharedSuffix < original.length - changeStart
    && sharedSuffix < revised.length - changeStart
    && original[original.length - sharedSuffix - 1] === revised[revised.length - sharedSuffix - 1]
  ) sharedSuffix++;

  const originalChangeEnd = original.length - sharedSuffix;
  const revisedChangeEnd = revised.length - sharedSuffix;
  const changedOriginalChars = Math.max(0, originalChangeEnd - changeStart);
  const contextBudget = Math.max(0, maxOriginalChars - changedOriginalChars);
  let originalStart = Math.max(0, changeStart - Math.floor(contextBudget / 3));
  let originalEnd = Math.min(
    original.length,
    Math.max(originalChangeEnd, originalStart + maxOriginalChars),
  );

  if (originalEnd - originalStart < maxOriginalChars && originalStart > 0) {
    originalStart = Math.max(0, originalEnd - maxOriginalChars);
  }

  // The window begins in the unchanged prefix and ends in the unchanged
  // suffix. Shift its revised end by the edit delta to preserve the same
  // semantic endpoint rather than cutting the new text short.
  const revisedStart = originalStart;
  const revisedEnd = Math.min(
    revised.length,
    originalEnd + (revisedChangeEnd - originalChangeEnd),
  );
  const originalText = original.slice(originalStart, originalEnd);
  const revisedText = revised.slice(revisedStart, revisedEnd);
  const tokenBudget = Math.max(100, (originalText.length + revisedText.length) * 2);

  return {
    originalText,
    revisedText,
    chunks: createWordDiffExcerpt(originalText, revisedText, tokenBudget),
    originalStart,
    originalEnd,
    revisedStart,
    revisedEnd,
    hasPrefix: originalStart > 0,
    hasSuffix: originalEnd < original.length,
  };
}

/**
 * Build tracked changes for the exact slice of REVISED text that is currently
 * visible. Insertions that touch the slice and deletions anchored inside it are
 * kept whole: the provenance view may grow to show the complete edit, while an
 * edit elsewhere in a collapsed card does not leak into this window.
 */
export function createWordDiffForRevisedRange(
  original,
  revised,
  revisedStart = 0,
  revisedEnd = revised.length,
  precomputedDiff,
) {
  const start = Math.max(0, Math.min(revised.length, revisedStart));
  const end = Math.max(start, Math.min(revised.length, revisedEnd));
  const diff = precomputedDiff ?? createWordDiff(original, revised);
  const entries = [];
  let revisedOffset = 0;

  for (const chunk of diff) {
    const chunkStart = revisedOffset;
    const chunkEnd = chunk.kind === "delete"
      ? chunkStart
      : chunkStart + chunk.text.length;
    entries.push({ chunk, start: chunkStart, end: chunkEnd });
    revisedOffset = chunkEnd;
  }

  const selectedChanges = new Set();
  entries.forEach((entry, index) => {
    if (entry.chunk.kind === "equal") return;
    const selected = entry.chunk.kind === "delete"
      // A deletion has zero revised width, so attach it to the content that
      // follows. At the document end it belongs to the fully-expanded range.
      ? entry.start >= start
        && (entry.start < end || (end === revised.length && entry.start === end))
      : Math.min(end, entry.end) > Math.max(start, entry.start);
    if (selected) selectedChanges.add(index);
  });

  // A replacement is normally an adjacent delete+insert pair. If a long
  // insertion only partly intersects the window, retain its paired removal too
  // so the expanded provenance view still explains the whole change.
  for (const selectedIndex of Array.from(selectedChanges)) {
    for (let index = selectedIndex - 1; index >= 0 && entries[index].chunk.kind !== "equal"; index--) {
      selectedChanges.add(index);
    }
    for (let index = selectedIndex + 1; index < entries.length && entries[index].chunk.kind !== "equal"; index++) {
      selectedChanges.add(index);
    }
  }

  const chunks = [];
  entries.forEach((entry, index) => {
    if (entry.chunk.kind !== "equal") {
      if (selectedChanges.has(index)) chunks.push(entry.chunk);
      return;
    }
    const visibleStart = Math.max(start, entry.start);
    const visibleEnd = Math.min(end, entry.end);
    if (visibleEnd <= visibleStart) return;
    chunks.push({
      kind: entry.chunk.kind,
      text: entry.chunk.text.slice(visibleStart - entry.start, visibleEnd - entry.start),
    });
  });

  return {
    chunks: compact(chunks),
    hasChanges: selectedChanges.size > 0,
    revisedStart: start,
    revisedEnd: end,
    hasPrefix: start > 0,
    hasSuffix: end < revised.length,
  };
}

/**
 * Attach relationship-highlight indices to tracked-change chunks.
 *
 * Equal and inserted text have width in the revised string, so ordinary range
 * overlap is sufficient. Deleted text has zero revised width: it inherits a
 * relation when its anchor falls inside that relation, or when it is the
 * removal half of an immediately adjacent replacement whose inserted half is
 * highlighted. The latter is what keeps "top tier" highlighted when the
 * published replacement "top-tier" is underlined.
 */
export function annotateDiffHighlightRelations(chunks, relations = []) {
  let revisedOffset = 0;
  const annotated = chunks.map((chunk) => {
    const revisedStart = revisedOffset;
    const revisedEnd = chunk.kind === "delete"
      ? revisedStart
      : revisedStart + chunk.text.length;
    revisedOffset = revisedEnd;

    const relationIndices = chunk.kind === "delete"
      ? relations.flatMap((relation, index) => (
          relation.contentStart < revisedStart && revisedStart < relation.contentEnd
            ? [index]
            : []
        ))
      : relations.flatMap((relation, index) => (
          Math.min(revisedEnd, relation.contentEnd)
            > Math.max(revisedStart, relation.contentStart)
            ? [index]
            : []
        ));

    return {
      ...chunk,
      revisedStart,
      revisedEnd,
      relationIndices,
    };
  });

  // Replacement chunks are contiguous non-equal runs. If their inserted half
  // overlaps a relation, paint the paired removal with that same relation even
  // when the edit is anchored exactly at the relation's start or end.
  let groupStart = 0;
  while (groupStart < annotated.length) {
    if (annotated[groupStart].kind === "equal") {
      groupStart++;
      continue;
    }
    let groupEnd = groupStart + 1;
    while (groupEnd < annotated.length && annotated[groupEnd].kind !== "equal") groupEnd++;
    const replacementRelations = new Set(
      annotated
        .slice(groupStart, groupEnd)
        .filter((chunk) => chunk.kind === "insert")
        .flatMap((chunk) => chunk.relationIndices),
    );
    if (replacementRelations.size > 0) {
      for (let index = groupStart; index < groupEnd; index++) {
        if (annotated[index].kind !== "delete") continue;
        annotated[index].relationIndices = Array.from(new Set([
          ...annotated[index].relationIndices,
          ...replacementRelations,
        ])).sort((a, b) => a - b);
      }
    }
    groupStart = groupEnd;
  }

  return annotated;
}
