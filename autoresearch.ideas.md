# Autoresearch Ideas

- Add compact, optional transcript/event summarization for experience observability if it can be implemented mostly server-side without increasing client bundle much.
- Larger structural experiment: replace `useChat`/`fetchServerSentEvents` with a minimal local hook only if we first document TanStack AI stream chunk formats and add functional tests; potential large bundle win but high correctness risk.
