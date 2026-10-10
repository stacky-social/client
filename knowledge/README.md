# Repository decision database

Open the **repository root** as a vault in Obsidian, enable the built-in Bases plugin, and open [Decisions.base](Decisions.base). Existing Markdown files are the records; their text and paths remain intact. No community plugin or duplicate export is needed. The table includes local private documentation when present.

Start with [the October UX decisions](2026-10-10-related-posts-and-replies.md), [the project README](../README.md), [URL state](../src/app/\(shell\)/ChineseEVs/URL_SCHEMA.md), and [backend planning](../BACKEND_INTEGRATION_AND_STUDY_PLAN.md). The historical designs remain under `docs/superpowers/` on machines that have them. Existing documentation is indexed at document granularity so every recorded decision retains its rationale, alternatives, and original context; new decisions should get a focused note when independently supersedable.

## Record conventions

Use these flat YAML properties consistently:

| Property | Values / meaning |
| --- | --- |
| `knowledge_type` | `decision`, `design`, `plan`, `audit`, `convention`, `reference` |
| `decision_status` | `accepted`, `proposed`, `historical`, `superseded`, `reference` |
| `visibility` | `public` or `private`; informational, not an access control |
| `title` | Human-readable title |
| `recorded_on` | Original known date as YYYY-MM-DD; omit when unknown |
| `supersedes` | Optional list of quoted links to older records |

Historical specs and plans are evidence of past intent, **not instructions to execute**. Their original status labels, checklists, and agent directives are preserved as source material. `historical` means current implementation has not been re-audited against every claim. Do not promote a plan to accepted merely because it is indexed. The checked-out code and fresh validation establish current behavior.

For future sessions: read the applicable decision note, inspect the implementation, record the reason for a change and relevant validation, and link replacement decisions instead of silently rewriting history. Keep original dates separate from validation dates. Use normal relative Markdown links so notes also work on GitHub; escape parentheses in paths.

## Privacy and maintenance

`docs/` remains ignored under the existing July 2026 privacy decision. Its 24 existing Markdown records have been indexed locally with metadata, without copying their content into public files. The tracked database definition queries their metadata when available; a fresh clone will not contain those private records. No private author names or audit content are exported. `.claude/` is hidden by Obsidian, so its convention documents may need to be read directly in the repository; they retain metadata for other Markdown tools.

Keep personal Obsidian state in the ignored `.obsidian/` directory. Do not move source notes just to rearrange a view. New notes with `knowledge_type` automatically enter the Base. The database is a view over plain files, so Git remains the history and collaboration mechanism.

## Sources and design rationale

Researched 2026-10-10 using official Obsidian documentation:

- [Introduction to Bases](https://obsidian.md/help/bases): local Markdown plus properties is the storage model. We therefore index existing sources instead of duplicating them.
- [Bases syntax](https://obsidian.md/help/bases/syntax): the `.base` file uses YAML filters and table views; the database has views for accepted decisions, historical documents, and proposals.
- [Properties](https://obsidian.md/help/properties): keep a small, flat, consistently typed schema rather than embedding complex objects in frontmatter.
- [Internal links](https://obsidian.md/help/links): use links between source records and successor decisions so provenance remains navigable.

These are repository design choices based on the documented capabilities, not a claim that Obsidian prescribes this particular workflow.
