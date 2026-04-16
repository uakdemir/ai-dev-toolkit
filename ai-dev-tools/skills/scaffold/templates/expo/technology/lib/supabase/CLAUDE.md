# `lib/supabase/` — Supabase SDK boundary

## What this is for

Supabase is the **backend-as-a-service** for this stack:
- Managed Postgres (primary data store)
- Auth (email/password, OAuth, magic link)
- Storage (files, images)
- Realtime (Postgres change feeds + broadcast)
- Edge Functions (Deno-based server code for secure / admin ops)

## API key configuration

- **Public Supabase URL + anon key** live in EAS Secrets
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) and are injected at build time.
- **Service-role key** (admin, bypasses RLS) NEVER appears in the app
  bundle. It lives ONLY in Supabase Edge Function env and CI secrets.

## Canonical usage patterns

```ts
// lib/supabase/client.ts — single shared client instance
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

```ts
// lib/supabase/hooks/useCurrentUser.ts — React Query wrapper
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../client';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
  });
}
```

## Row-Level Security (RLS)

- **Every table MUST have RLS enabled.** Client code assumes RLS is on.
- Write policies in `supabase/migrations/` alongside the table DDL.
- Do not disable RLS "temporarily" — a production rollout with RLS off
  is a data-leak bug.

## Edge Functions

- Admin / webhook / cross-service work (RevenueCat → OneSignal tagging,
  third-party webhooks) runs in Edge Functions.
- Invoke from client: `supabase.functions.invoke('fn-name', { body })`.
- Functions get the service-role key via env; the client only sends the
  anon JWT.

## What NOT to do

- **Do not create a second Supabase client** in app code — reuse the
  exported `supabase` instance.
- **Do not call `@supabase/supabase-js` from outside `lib/supabase/`**.
  Screens use React Query hooks from `lib/supabase/hooks/` or feature
  query files; they never import `createClient` or call `supabase`
  directly.
- **Do not bypass RLS from the client.** There is no legitimate reason
  — if you need service-role access, call an Edge Function.
- **Do not commit the service-role key to the repo.** Ever.

## Provider docs

- https://supabase.com/docs
- https://supabase.com/docs/guides/auth/auth-helpers/react-native

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
