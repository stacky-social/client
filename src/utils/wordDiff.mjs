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

/** Word-level LCS diff with surrounding context, suitable for a track-changes preview. */
export function createWordDiffExcerpt(original, revised, maxTokens = 100) {
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
