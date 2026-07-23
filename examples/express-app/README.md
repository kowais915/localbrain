# Example: Node/Express app using localbrain

A minimal Express server that calls the free local model. (Skeleton — to be
filled in during Phase 5, alongside the Express framework adapter.)

## Intended shape

```bash
# from this folder
npx localbrain
```

localbrain detects Express, adds `LOCALBRAIN_URL` to `.env`, and creates a
`lib/ai.js` helper:

```js
// index.js
import express from 'express'
import { ai } from 'localbrain'

const app = express()
app.use(express.json())

app.post('/extract', async (req, res) => {
  const data = await ai.extract(req.body.text, { name: '', date: '', amount: 0 })
  res.json(data)
})

app.listen(3000)
```
