---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Descendants retain original wording inside their thread
recorded_on: 2026-10-12
---

# Descendants retain original wording inside their thread

Replies and deeper descendants appear with their original wording because the surrounding thread supplies context. Decontextualized rewrites belong to related-post presentations. Opening a descendant as the focused post must not unexpectedly change its wording.

## Report and cause

The EnergyTech thread for Car54 (`cw-Uqkr_kO7p7s38ggg`) displayed Peter Ware (`cw-vyPJW7taRHpwMt4h`) as “Being a utility engineer does not make someone a network engineer.” Opening Peter Ware instead showed the original “You may be a utility engineer, but you are not a network engineer.”

`getMockReplies` deliberately preferred a focus-scoped rewritten copy, while `getMockPost` selected the canonical post. Reply relation offsets were measured against that rewritten copy, so changing only the body would misalign the contribution highlights.

## Required behavior

Use the original thread body for descendants and keep focus-scoped relation metadata. Project content-side highlight and emphasis offsets onto the original text; retain focus-side offsets, topics, contribution categories, parent relationships, and reply ranks. Related-pane rewrite and Modified-preview behavior remains unchanged.

## Validation

The browser regression uses the reported Car54/Peter Ware pair, checks the complete original descendant body and the highlighted original closing sentence, then opens the descendant and checks that its body is identical.

Implementation uses the canonical focused body when available; otherwise recorded `rewrite.originalContent` supplies the authored wording without replacing the post's other metadata. If no authored source exists, the available body remains rather than inventing an original. The shared word-diff mapping moves only reply-side highlight and crux ranges; a passage wholly added by rewriting receives no fabricated original highlight. The aside continues to read its separate scoped objects.

Validation: all 217 unit tests passed, including the exact screenshot pair, replaced phrases, contextual insertions, safe HTML escaping, and range bounds across imported replies. The screenshot-pair browser regression passed in 5.5s. Primary review checked canonical metadata preservation and that related-pane data is untouched. TypeScript and targeted ESLint passed. The user subsequently requested publication to `dev`; this follow-up is tracked with issue #259.

Related: [reply browsing decisions](2026-10-10-related-posts-and-replies.md). This decision supersedes the resolver's earlier preference for rewritten descendant display copies.
