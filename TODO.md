# TODO

## Pending: Per-Platform Storage Restructure

**Goal:** Move Facebook-specific config out of the generic `BotConfig` into a platform-scoped storage, so `bot-config-storage.ts` becomes a clean global placeholder and each platform owns its own config.

**Plan file:** `/home/haku/.claude/plans/effervescent-questing-clover.md`

### Steps (in order)

- [ ] **Step 0** — Commit current uncommitted changes first (LLM prompts, bot-config defaults, build files, MEMORY.md)
- [ ] **Step 1** — Create `packages/storage/lib/impl/platforms/facebook.ts` — `FacebookBotConfig` interface + `facebookBotConfigStorage` (key: `'facebook-config'`)
- [ ] **Step 2** — Create `packages/storage/lib/impl/platforms/index.ts` — barrel re-export with commented stubs for future platforms
- [ ] **Step 3** — Update `packages/storage/lib/impl/index.ts` — add `export * from './platforms/index.js';`
- [ ] **Step 4** — Strip `packages/storage/lib/impl/bot-config-storage.ts` to a comment-only global placeholder (no exports)
- [ ] **Step 5** — Update `pages/content-ui/src/matches/facebook/App.tsx` — swap `botConfigStorage` → `facebookBotConfigStorage` (2 lines only)
- [ ] **Verify** — `pnpm type-check` / `pnpm build` → zero errors, extension loads on Facebook
