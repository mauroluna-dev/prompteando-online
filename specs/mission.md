# Mission — prompteando

## Visión
Que cualquier persona pueda versionar y consumir prompts con la
confianza de que su historial nunca se pierde y nunca queda secuestrado
por un proveedor.

## Personas (V1)
1. **No-coder orquestador (driver)** — founders, PMs, marketers que
   arman flujos con LLMs en n8n / Zapier / Make. No tocan código pero
   pegan prompts en nodos y necesitan iterarlos sin perder lo que
   funcionaba. Es el "primer cliente feliz" del MVP — ante cualquier
   conflicto de UX, gana esta persona.
2. **Vibe-coder** — devs que copy-pastean prompts entre Cursor,
   Claude Code y ChatGPT, y pierden la versión que andaba.

## Problema
Hoy los usuarios sobreescriben prompts directamente:
- No hay historial.
- No hay rollback cuando una iteración rompe el output.
- No saben qué versión está corriendo en producción.
- El "backup" es pegarlo en un Google Doc o en Notion.

## Solución
prompteando = versionador de prompts con cero fricción para no-coders.
- Cada `Save` crea una versión inmutable, numerada.
- Cada prompt expone un endpoint público de lectura con API Key.
- Si el usuario conecta GitHub, el versionado se replica en su repo.
  Si no, igual funciona — la app es plenamente usable sin GitHub.

## Diferenciador
Posicionamiento: **"PromptLayer pero gratis y sin vendor lock-in"**.
- **Gratis sin asteriscos** en V1 (sin trial, sin paywall, sin billing
  infra). Solo rate limits anti-abuso por API Key.
- **Tu historial, tu repo (opcional pero flagship)**: si conectás
  GitHub, el storage canónico vive en TU repo bajo TU cuenta. Si
  mañana cerramos prompteando, te quedás con todo el historial.
- **Exportable por diseño**: aun sin GitHub, podés bajarte tus
  prompts en cualquier momento (export ZIP / JSON). Nunca rehén.

## GitHub: opcional pero flagship
- **Default path (flagship)**: signup → "Conectá GitHub" como CTA
  destacado → cada save commitea en tu repo automáticamente.
- **Fallback path**: signup sin GitHub (para no-coders que no saben
  qué es Git). Funcionalidad completa contra la BD interna.
  "Conectar GitHub" sigue disponible como upgrade en cualquier momento.
  Al conectarse, se hace backfill del historial al repo nuevo.

## Out of scope (V1)
prompteando V1 **no** incluye:
- Evaluación / scoring de prompts
- A/B testing entre versiones
- Logging detallado de invocaciones (event-level tracing)
- Playground multi-modelo
- Análisis de costos / tokens
- Colaboración / teams / permisos
- Billing / planes pagos
- **Templates con variables** (`{{var}}` substitution) — ver V2
  abajo.

V1 = **storage + versionado + consumo por API + métricas básicas
de uso**. Nada más.

> **Nota sobre métricas (sesión 2026-05-04)**: la observabilidad
> de uso por API key (requests/día, p50/p95, error rate, top
> prompts) entra en V1 vía P18 — no es "logging detallado" sino
> agregados pre-computados que el usuario consume desde su
> dashboard. El logging event-level (cada request como fila)
> sigue out-of-scope por costo de storage y por no aportar valor
> al persona target.

## V2 — Próximo gran salto (post-MVP)
Después de cerrar V1 (P0–P18 + Pγ), V2 abre con:
- **Templates con variables**: `{{var}}` substitution server-side,
  endpoint `POST /v1/prompts/:slug/render`. Activación opt-in
  por prompt para no romper backward-compat. Detalles tentativos
  en `roadmap.md` → sección V2.
- **Evaluation framework** (TBD): comparar outputs entre versiones
  contra un test set definido por el usuario.
- **Teams / sharing** (TBD): un primer pase de colaboración chica
  (1-3 personas), no enterprise IAM.

Lo que decidamos en V2 emerge del feedback real de usuarios V1,
no de hipótesis ahora.

## North Star (V1)
Time-to-first-value < 5 minutos:
usuario llega → se registra → crea prompt → lo consume vía API desde
un workflow externo (n8n / curl / fetch). GitHub es un plus, no un
prerequisito.
