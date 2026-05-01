# QR Table Stale Data Flash Research

## Observed behaviors

1. **Edit title → return home**: table briefly shows old title, then updates to new.
2. **Delete → return home**: table briefly shows deleted QR code, then removes it.

## Root cause

TanStack Router's built-in SWR cache with these defaults (from `data-loading.md`):

> By default, `staleTime` is set to `0`, meaning that the route's data is immediately considered stale. [...] `gcTime` is set to **30 minutes**. [...] `staleReloadMode` is `'background'`, so stale successful matches keep rendering with their existing `loaderData` while the loader revalidates in the background.

The `/app/` route's loader data from the previous visit lives in cache for 30 minutes. On re-entry (both cases), `staleTime: 0` means data is stale, so the loader re-runs — but `staleReloadMode: 'background'` renders the stale cached data **immediately** while the fresh fetch happens in the background. That's the flash.

### Why `router.invalidate()` doesn't help

`router.invalidate()` reloads **currently active route matches**. When on the edit page, `/app/` is not an active match — its stale cached data persists untouched. Even if invalidate did mark it stale, SWR would still show the stale data on re-entry.

## Fix options

### Option A: `staleReloadMode: 'blocking'` on `/app/`

Blocks the navigation until the fresh loader result is ready. No stale flash; shows a pending/loading state instead.

```ts
// src/routes/app.index.tsx
export const Route = createFileRoute("/app/")({
  loader: { fn: () => listQrCodes(), staleReloadMode: "blocking" },
  component: AppIndex,
});
```

From docs:
> Use `'blocking'` when you want stale matches to behave more like a fresh load and wait for the new loader result.

With `staleTime: 0` (default), every navigation to `/app/` already re-runs the loader — `blocking` just makes the render wait for it. No other changes needed.

### Option B: `gcTime: 0` on `/app/`

Discards cache immediately on leaving the route. On re-entry there's no stale data — loader runs fresh and the route shows a loading state until it resolves.

```ts
export const Route = createFileRoute("/app/")({
  gcTime: 0,
  loader: () => listQrCodes(),
  component: AppIndex,
});
```

From docs:
> Similar to Remix's default functionality, you may want to configure a route to only load on entry [...] You can do this by using the `gcTime` option.

Difference from A: shows a blank/pending state rather than blocking the navigation transition.

## Recommendation

**Option A** (`staleReloadMode: 'blocking'`) — one-line change in `app.index.tsx`, matches user expectation that the list reflects the just-completed mutation, and produces a cleaner transition (navigation waits, page appears correct immediately) vs a blank loading state.
