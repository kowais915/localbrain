# Example: Next.js app using localbrain

A minimal Next.js app that calls the free local model. (Skeleton — to be filled
in during Phase 5, alongside the Next.js framework adapter.)

## Intended shape

```bash
# from this folder
npx localbrain
```

localbrain detects Next.js, adds `LOCALBRAIN_URL` to `.env.local`, and creates a
`lib/ai.ts` helper:

```ts
// lib/ai.ts
export { ai } from 'localbrain'
```

```ts
// app/api/tag/route.ts
import { ai } from '@/lib/ai'

export async function POST(req: Request) {
  const { text } = await req.json()
  const label = await ai.classify(text, ['work', 'personal', 'urgent'])
  return Response.json({ label })
}
```

> Note: a local model runs in dev for free, but **cannot run on serverless**
> (Vercel/Netlify) in production — see the README's "The honest part about 'free'".
