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
