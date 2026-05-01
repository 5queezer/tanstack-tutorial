# Autoresearch Ideas

- Add compact, optional transcript/event summarization for experience observability if it can be implemented mostly server-side without increasing client bundle much.
- Investigate lazy-loading markdown/tool rendering for long conversations if bundle and UX tradeoffs are favorable; total-JS metric may penalize chunk overhead, so only keep if total gzip improves.
- Larger structural experiment: replace `useChat`/`fetchServerSentEvents` with a minimal local hook only if we first document TanStack AI stream chunk formats and add functional tests; potential large bundle win but high correctness risk.
