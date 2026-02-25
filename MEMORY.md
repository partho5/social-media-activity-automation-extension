# Social Media Automation Extension - Progress Tracker

## Project Goal
Build a social media automation activity extension that works with:
- Facebook (facebook.com) - **PRIMARY FOCUS**
- LinkedIn (linkedin.com) - future
- X/Twitter (x.com) - future

Each platform will have separate, custom functionalities.

---

## ✅ What Has Been Done

### Boilerplate Cleanup
- Removed new-tab override from manifest
- Removed new-tab page directory
- Renamed all `example` references → `facebook`
- Updated manifest to target facebook.com
- Cleared the bottom banner UI (content-ui/all/App.tsx returns null)

### Facebook Automation Core (`pages/content/src/facebook-utils.ts`)
- `getFirstPostText()` - gets first post text (for console testing)
- `getAllPostTexts()` - gets all post texts as strings (for console testing)
- `getAllPostElements()` - returns DOM elements, **skips already-commented posts** (uses `data-ceb-commented="true"` marker)
- `expandAllPosts()` - scrolls through all posts, clicks "See more" if present, logs content, takes natural 2-4s reading pauses
- `postFacebookComment(postEl, commentText)` - posts comment on a **specific post element**, finds comment button within its `[role="article"]` parent, marks post as `data-ceb-commented="true"` after success, closes popup if it appears

### Content Script (`pages/content/src/matches/facebook/index.ts`)
- Exposes all functions to `window.fbAutomate` for manual testing
- `getAllPosts` → returns DOM elements (for automation loop)
- `getAllPostTexts` → returns strings (for console testing)

### Facebook Bot UI (`pages/content-ui/src/matches/facebook/App.tsx`) ✅ WIRED TO LLM
- Fixed-position panel (bottom-right) only visible on facebook.com
- Shows current status in real time
- **Start button** runs the full automation loop:
  1. Reads `botConfigStorage` (persona, language, tone, topic)
  2. Creates `LLMClient` from `process.env.CEB_OPENAI_API_KEY` (baked at build time)
  3. For each post: calls `llm.run(FacebookPrompts.commentDecision, { postContent, persona, language })`
  4. Logs decision + reason: `🤖 LLM decision — shouldComment: true/false | reason: ...`
  5. Posts LLM-generated comments or skips based on decision
  6. Natural 5-8 second interruptible delays between posts
  7. Scroll down to load more posts
  8. Repeat until stopped or no posts found
- **Stop button** - always enabled, interrupts within 500ms (chunked delays)
- **Error handling**: If LLM fails (missing API key, network error, invalid response) → skip post and continue
- **UI status**: Shows `🤖 Asking LLM...` while awaiting, then `💬` (commented) or `⊘ skipped — {reason}`

---

## ⚠️ Challenges Faced

### 1. React/Lexical Editor Compatibility
- Plain `innerText =` or `value =` don't trigger React state updates
- **Fix**: `document.execCommand('insertText', false, text)` is the only reliable way to insert text into Facebook's Lexical editor

### 2. Dynamic DOM Elements
- Comment button and input don't exist until clicked
- **Fix**: `waitFor(selector)` with MutationObserver that resolves when element appears

### 3. Correct Post Selector
- Random class names don't work on Facebook
- **Fix**: `[data-ad-rendering-role="story_message"]` is the stable selector for post content

### 4. Commenting Same Post Repeatedly
- `postFacebookComment()` was using global `document.querySelector` for comment button, always targeting the first post
- **Fix**: Now accepts a `postEl: HTMLElement` and searches within `postEl.closest('[role="article"]')`, marks post with `data-ceb-commented="true"` after success

### 5. Stop Button Not Working
- Button was `disabled={isRunning && !shouldStopRef.current}` — disabled DURING automation
- Delays were single `setTimeout` calls that couldn't be interrupted
- **Fix**: `disabled={false}` always, delays broken into 500ms chunks with `shouldStopRef.current` check in loop

### 6. Post-Comment Popup Blocking Next Post
- After commenting, Facebook shows a popup with a Close (✕) button
- **Fix**: After submit, check for `[aria-label="Close"]` and click it

### 7. Posts Without "See More" Being Skipped
- Originally used `continue` if no "See more" button, skipping the post entirely
- **Fix**: Only skip the click, still process and log the post; commenting handled separately

---

## LLM Module (`packages/llm`)

New shared package `@extension/llm` — usable from any platform's content script or UI.

### Architecture
```
packages/llm/
  lib/
    providers/
      types.ts       # LLMProvider interface, LLMRequest/Response/Config
      openai.ts      # OpenAIProvider (gpt-4o-mini default, configurable)
      index.ts
    prompts/
      types.ts       # PromptTemplate<TResponse>, Platform, PromptVariables
      registry.ts    # PromptRegistry (register/get/interpolate)
      platforms/
        facebook.ts  # FacebookPrompts.{commentDecision, commentGenerate, relevanceCheck, all}
        linkedin.ts  # LinkedInPrompts.{commentDecision, all}
      index.ts
    client.ts        # LLMClient.run(id, vars) + runTemplate() + 3 factory fns
  index.mts          # public exports
```

### Key exported factories (API key auto-read from `process.env.CEB_OPENAI_API_KEY`)
- `createFacebookLLMClient()` — OpenAI + all Facebook prompts
- `createLinkedInLLMClient()` — OpenAI + all LinkedIn prompts
- `createLLMClient(provider, prompts)` — fully custom

### Usage in App.tsx
```ts
import { createFacebookLLMClient, FacebookPrompts, type FacebookCommentDecision } from '@extension/llm';
const llm = createFacebookLLMClient(); // reads OPENAI_API_KEY from .env
const decision = await llm.run<FacebookCommentDecision>(
  FacebookPrompts.commentDecision.id,
  { postContent: post.innerText.slice(0, 600), persona: 'a tech enthusiast', language: 'English' },
);
if (decision.shouldComment && decision.comment) {
  await fb.postComment(post, decision.comment);
}
```

### Adding a new prompt
1. Add a `PromptTemplate<YourResponseType>` to the relevant `platforms/*.ts` file
2. Add it to the `allXxxPrompts` array in that file — auto-registered by the factory

### Adding a new provider (e.g. Anthropic)
Create `packages/llm/lib/providers/anthropic.ts` implementing `LLMProvider`, then pass it to `createLLMClient()`.

---

## ⏳ Next Steps

1. **Test on real Facebook** ✅ *Primary goal complete, now test in action*
   - Verify post targeting works across different post types (image posts, link posts, video posts, etc.)
   - Check that LLM comments are contextual and not generic
   - Monitor console logs for decision reasons
   - Test API key missing error handling
2. **Make persona/language customizable** - add UI inputs to popup/options to configure `botConfigStorage` values
3. **Rate limiting / anti-bot** - add smarter delays if Facebook shows CAPTCHA or rate limit warnings
4. **LinkedIn support** - create linkedin-utils.ts and separate content scripts
5. **X/Twitter support** - same pattern

---

## Architecture Notes
- **Tech Stack**: React + Vite + TypeScript
- **Manifest**: V3
- **Key Entry Points**:
  - `pages/content/src/facebook-utils.ts` - Core automation logic
  - `pages/content/src/matches/facebook/index.ts` - Exposes `window.fbAutomate`
  - `pages/content-ui/src/matches/facebook/App.tsx` - Bot control UI
- **Build**: `pnpm run build`
- **Test**: Load unpacked extension from `dist/` folder in Chrome

## Facebook Selectors (Confirmed Working)
- Posts: `[data-ad-rendering-role="story_message"]`
- "See more" button: `[role="button"]` with innerText containing "See more"
- Comment button: `[aria-label="Leave a comment"]` or `[aria-label="Comment"]`
- Comment input: `[contenteditable="true"][data-lexical-editor="true"]`
- Close popup button: `[aria-label="Close"]`
- Post article container: `[role="article"]`
