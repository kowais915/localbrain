# localbrain-client

The featherweight client for a [**localbrain**](https://github.com/kowais915/localbrain) endpoint — free, private, local AI for your app. **Zero dependencies**; it just makes HTTP calls to a local, OpenAI-compatible model.

```bash
npm i localbrain-client
```

```ts
import { ai } from 'localbrain-client'

await ai.chat('Summarize: ...')
await ai.classify(text, ['work', 'personal', 'urgent'])   // → one label
await ai.extract(text, { name: '', date: '', amount: 0 })  // → schema-valid JSON
await ai.summarize(longText)
await ai.embed(text)                                       // → vector, for semantic search
```

By default it talks to `http://localhost:4141/v1` (override with `LOCALBRAIN_URL` or `createAi({ baseUrl })`). No API key required.

## Getting an endpoint

This package is only the client. To stand up the local model + endpoint it talks to, run the CLI in your project once:

```bash
npx localbrain
```

That downloads a small open-weight model and serves it locally. See the [main README](https://github.com/kowais915/localbrain#readme) for the full story.

## Notes

- **Server-side use** — call it from Node (API routes, server actions, workers). It uses `fetch`; it does not run the model itself.
- **Typed & actionable errors** — failures throw `LocalbrainError` with a `code` and a `hint`.
- `createAi({ baseUrl, model, timeoutMs })` returns a client bound to a specific config.

## License

MIT
