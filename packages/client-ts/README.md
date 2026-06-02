# @prompteando/client

Cliente oficial de [Prompteando](https://github.com/mauroluna-dev/prompteando-online)
para TypeScript/JavaScript. Cero dependencias.

```bash
npm install @prompteando/client
```

```ts
import { PrompteandoClient } from "@prompteando/client";

const stash = new PrompteandoClient({
  apiKey: "po_live_...",
  baseUrl: "https://prompts.tu-dominio.com", // tu instancia self-hosted
});

// Traer un prompt (por label de deploy o versión)
const prompt = await stash.getPrompt("welcome-email", { label: "production" });
console.log(prompt.content, prompt.config);

// Renderizar un template
const rendered = await stash.render("welcome-email", {
  vars: { nombre: "Ana", producto: "Plan Pro" },
  label: "production",
});
console.log(rendered.content); // text → string
// para prompts chat: rendered.messages (array de {role, content})
```

- **Caching + fallback**: `getPrompt` cachea por `cacheTtlMs` (60s por
  default) y, ante un 5xx o error de red, sirve el último valor bueno.
- **Labels / versiones**: pasá `{ label }` o `{ version }`.
- **Strict errors**: lanza `PrompteandoError` (con `status` y `body`) en
  4xx (ej: 422 por variables faltantes).
