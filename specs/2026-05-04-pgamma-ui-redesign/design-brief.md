# Pγ — UI Redesign Design Brief

> Visual direction definida en sesión 2026-05-04 con stakeholder + CTO.
> Este doc captura tokens, estilo, frame inventory y specs por
> pantalla. La ejecución en Pencil queda para sesión separada
> (Pencil MCP tiene bugs de encoding en `set_variables` que bloquean
> la batería de operaciones). Frames actuales en `pencil-new.pen`
> (Login, Prompt List, Editor, API Keys, Settings, Landing,
> Roadmap) sirven de baseline pero se rediseñan completos.

---

## 1. Visual direction

- **Style base**: Soft Bento (Pencil style guideline). Bento de
  cards modulares, separación clara, low-noise.
- **Color palette**: Carbon Frost (Pencil palette). Light theme
  default. Paleta gris-frío con un acento dark para las CTAs.
- **Densidad**: Medium para la mayoría de pantallas. Compact
  permitido en tablas (API key metrics, version history).
- **Roundness**: Basic (radius-m = 12px en cards, radius-sm = 8px
  en botones e inputs, radius-pill en badges).
- **Elevation**: Soft Lift (sombras sutiles, no Material-style).

## 2. Typography

| Rol | Familia | Notas |
|-----|---------|-------|
| Display (h1, h2, hero) | **Cal Sans** | Vercel-made geometric display. Self-hosted via `@fontsource/cal-sans`. Fallback: `Geist` → `system-ui`. |
| Body (párrafos, labels, UI) | **Numans** | Google Font, neutral sans, alta legibilidad. Self-hosted via `@fontsource/numans`. Fallback: `Inter` → `system-ui`. |
| Mono (code, slugs, API keys, JSON) | **Geist Mono** | Vercel mono, cohesivo con Cal Sans. `@fontsource/geist-mono`. Fallback: `ui-monospace`. |

**Importante (sesión 2026-05-04)**: respetar `line-height` y reglas
de los repos oficiales:
- Cal Sans: `line-height: 1.1` para H1/H2, `1.2` para H3-H4. No
  bold (la fuente ya viene con character weight propio).
- Numans: `line-height: 1.5` para body, `1.4` para captions.
- Geist Mono: `line-height: 1.5` para code blocks; `1.0` para
  inline code dentro de párrafos.

## 3. Design tokens (Tailwind v4 → `@theme`)

```css
/* src/frontend/styles/tokens.css */
@theme {
  /* Colors */
  --color-surface-elevated: #FFFFFF;
  --color-surface-primary: #FFFFFF;
  --color-surface-secondary: #FAFAFA;
  --color-surface-subtle: #F4F4F5;

  --color-foreground-primary: #0A0A0A;
  --color-foreground-secondary: #737373;
  --color-foreground-muted: #A1A1AA;

  --color-border-subtle: #E5E5E5;
  --color-border-strong: #D4D4D8;

  --color-accent-primary: #18181B;     /* zinc-900: CTA, dark text */
  --color-accent-secondary: #4F46E5;   /* indigo-600: links, accent */

  /* Semantic */
  --color-success-fg: #15803D;
  --color-success-bg: #DCFCE7;
  --color-warning-fg: #A16207;
  --color-warning-bg: #FEF3C7;
  --color-destructive-fg: #B91C1C;
  --color-destructive-bg: #FEE2E2;
  --color-info-fg: #1D4ED8;
  --color-info-bg: #DBEAFE;

  /* Diff (P17) */
  --color-diff-add-bg: #DCFCE7;
  --color-diff-add-fg: #14532D;
  --color-diff-del-bg: #FEE2E2;
  --color-diff-del-fg: #7F1D1D;

  /* Charts (P18) */
  --color-chart-1: #18181B;
  --color-chart-2: #4F46E5;
  --color-chart-3: #A1A1AA;

  /* Typography */
  --font-display: "Cal Sans", "Geist", system-ui, sans-serif;
  --font-body: "Numans", "Inter", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  /* Elevation */
  --shadow-soft-lift-sm: 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --shadow-soft-lift-md: 0 2px 8px -2px rgb(0 0 0 / 0.06);
  --shadow-soft-lift-lg: 0 8px 24px -4px rgb(0 0 0 / 0.08);
}
```

## 4. Spacing scale

| Contexto | Gap | Padding |
|----------|-----|---------|
| Page sections (vertical) | 24-32 | — |
| Card grid (horizontal) | 16-24 | — |
| Form fields | 16 | — |
| Button group | 12 | — |
| Inside cards | — | 24 |
| Inside buttons | — | [10, 16] |
| Inside inputs | — | [8, 16] |
| Page content | — | 32 |
| Sidebar item | 0 | [12, 16] |

## 5. Frame inventory (rediseño)

Total: 9 frames principales + 4 estados auxiliares.

### Pantallas principales (9)
1. **Landing** — Marketing público, single-page con hero +
   how-it-works + zero-friction reasons + CTA dual (GitHub /
   Google). Mantiene la screenshot del editor del actual landing.
2. **Login** — Single card centrada con 2 CTAs grandes (GitHub
   primary, Google secondary). Microcopy sobre privacidad y
   "no leemos tus repos".
3. **Prompt List** — Grid/list toggle, search + filtros (synced
   GitHub | not synced | template), card por prompt mostrando:
   nombre, slug, current version, last updated, badge GitHub
   sync, badge template (V2-only).
4. **Prompt Editor (P17)** — Layout en 3 zonas:
   - Header con name/slug/breadcrumbs + actions (Save, Diff
     toggle, Copy slug, More options).
   - Main: editor CodeMirror 6 markdown a full width OR split
     side-by-side cuando hay diff activo.
   - Sidebar derecho: Version History con cada versión
     clickeable (selectable A/B para diff). GitHubSyncBadge
     inline por versión.
5. **Prompt Editor — Diff mode (P17 sub-state)** — Mismo header,
   pero main área dividida 50/50: izquierda "Version A"
   (selectable, default = previous), derecha "Version B"
   (selectable, default = current). MergeView con highlights
   verdes/rojos. Picker dropdown en cada panel.
6. **API Keys (P18)** — Lista de keys + CTA Generate. Cada row
   es expandable con inline metrics dashboard:
   - 4 KPI cards: Total requests (30d), Error rate, p95 latency,
     Top prompt.
   - Bar chart de requests/day (últimos 30d).
   - Tabla top 5 prompts consumidos con request count + share %.
   - Range picker (7d / 30d / 90d).
7. **API Keys — Detail (P18 sub-page)** — `/settings/api-keys/:id`
   full-page con todo lo del expandable + tabla de últimos errores
   (status codes + counts) + chart de p50/p95 latency over time.
8. **Settings — Integrations** — GitHub card (con backfill UI de
   P12: pending / running con progress bar / completed banner /
   failed con copy de reconexión). Slot para futuras integraciones.
9. **Settings — Profile** (placeholder mínimo, no critical) —
   Email, github_login, account creation date, "Delete my account".

### Estados auxiliares (4)
- **Empty state component** — usado en Prompt List (no prompts),
  API Keys (no keys), Version History (1ra versión recién
  guardada), Metrics (no requests aún).
- **Loading skeleton** — para list, editor, dashboard.
- **Error boundary** — full-page para uncaught errors + inline
  card para errors per-section.
- **Toast** (sonner) — success/error/info, top-right, auto-dismiss.

## 6. Specs detalladas — P17 Editor + Diff

```
┌──────────────────────────────────────────────────────────────┐
│  promptstash | Prompts | API Keys | Settings           [👤]  │  64px header
├──────────────────────────────────────────────────────────────┤
│  ← Back to prompts                                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Onboarding Welcome                                      │ │  H1, Cal Sans, 32px
│  │ /v1/onboarding-welcome   [Copy]                         │ │  slug, mono, 14px
│  │                                                         │ │
│  │ [Edit] [Diff vs ▾]            [Save] [⋮]                │ │  toolbar
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────┬──────────────────────┐ │
│  │                                  │ History (4 versions) │ │
│  │  CodeMirror 6 editor             │ ──────────────────── │ │
│  │  markdown syntax highlighting    │ ● v4 • current       │ │  active state
│  │                                  │   "Add restart step" │ │
│  │  [content of current version]    │   2h ago • <8a3f12>  │ │
│  │                                  │                      │ │
│  │                                  │ ○ v3                 │ │
│  │                                  │   "Restore v1"       │ │
│  │                                  │   1d ago • <ce4ab90> │ │
│  │                                  │                      │ │
│  │                                  │ ○ v2                 │ │
│  │                                  │   "Friendlier tone"  │ │
│  │                                  │   1d ago • <c041afc> │ │
│  │                                  │                      │ │
│  │                                  │ ○ v1                 │ │
│  │                                  │   "Initial version"  │ │
│  │                                  │   3d ago • <abade71> │ │
│  └──────────────────────────────────┴──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Toggle "Diff vs" → state cambia a:

```
│  ┌──────────────────────────────────┬──────────────────────┐ │
│  │ Version A: v3 ▾    Version B: v4 ▾                      │ │  picker bar
│  ├──────────────────────────────────┼──────────────────────┤ │
│  │  CodeMirror MergeView A          │  MergeView B         │ │
│  │                                  │                      │ │
│  │  You are a friendly onboarding...│  You are a friendly..│ │
│  │  ─ - Keep responses under 2 sntncs─  + Keep responses ≤2│ │  red bg, line removed
│  │                                  │  + sentences. Avoid..│ │  green bg, line added
│  │  ...                             │  ...                 │ │
│  └──────────────────────────────────┴──────────────────────┘ │
```

**Componentes shadcn/ui requeridos**:
- `<Select>` para version pickers A/B
- `<ToggleGroup>` para Edit/Diff
- `<Card>` para containers
- `<Badge>` para version metadata
- `<Tooltip>` para sync status icons

**Componentes nuevos** (Pγ):
- `<MarkdownEditor>` — wrapper sobre CodeMirror 6 + tema
- `<VersionDiff>` — wrapper sobre `@codemirror/merge` MergeView
- `<VersionHistoryItem>` — row del sidebar, soporta active/hover/A-selected/B-selected states

## 7. Specs detalladas — P18 API Keys + Metrics

```
┌──────────────────────────────────────────────────────────────┐
│  promptstash | Prompts | API Keys | Settings           [👤]  │
├──────────────────────────────────────────────────────────────┤
│  API Keys                                  [+ Generate Key]  │
│  Manage keys for consuming prompts via the public API.       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ⚠ Copy your key now. It won't be shown again.           │ │  alert banner
│  │ ps_live_a1f2c2da9d6f74a5c80cea2f34c0c067     [📋 Copy]   │ │  (when just generated)
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Range: [7d] [30d ●] [90d]                                │ │  range picker (global)
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ▼ Production              ps_live_..7c80c067            │ │  expandable row
│  │   Created May 1 • Last used 2 minutes ago               │ │
│  │   ┌─────────┬─────────┬──────────┬────────────────────┐ │ │
│  │   │ 12,543  │ 0.4%    │ 87ms     │ onboarding-welcome │ │ │  KPI cards
│  │   │ Total   │ Errors  │ p95      │ Top prompt          │ │ │
│  │   │ (30d)   │         │          │ (4,832 req)         │ │ │
│  │   └─────────┴─────────┴──────────┴────────────────────┘ │ │
│  │                                                         │ │
│  │   Requests per day                                       │ │
│  │   ┌─────────────────────────────────────────────────┐   │ │
│  │   │ ▁▂▃▅▇█▇▆▅▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇▆▅▄▃▂▁                │   │ │  bar chart
│  │   └─────────────────────────────────────────────────┘   │ │
│  │                                                         │ │
│  │   Top prompts                                            │ │
│  │   onboarding-welcome     ████████████  4,832 (38%)      │ │  inline bar
│  │   product-description    ████████      2,901 (23%)      │ │
│  │   support-ticket-reply   █████         1,805 (14%)      │ │
│  │   blog-post-generator    ███           1,002 (8%)       │ │
│  │   other (12)             ███           2,003 (16%)      │ │
│  │                                                         │ │
│  │   [View full details →]                  [Revoke key]   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ▶ n8n Workflow              ps_live_..ee4d              │ │  collapsed
│  │   Created Apr 22 • Last used 1h ago                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ▶ Dev testing               ps_live_..0148              │ │
│  │   Created Apr 25 • Never used                           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Componentes shadcn/ui requeridos**:
- `<Collapsible>` (Radix) para expandable rows
- `<Card>`, `<Badge>`, `<Button>`
- `<ToggleGroup>` para range picker

**Componentes nuevos** (Pγ + P18):
- `<MetricCard>` — pill con valor grande + label arriba
- `<MiniBarChart>` — recharts BarChart sin axis, 30 barras
- `<TopPromptsList>` — rows con barra horizontal % + count
- `<UsageDashboard>` — orquesta todo lo de arriba

## 8. Frame inventory en Pencil

Cuando se desbloquee la sesión Pencil:

| Frame | ID actual | Acción Pγ |
|-------|-----------|-----------|
| Landing (`MUZm8`) | exists | Rediseñar con nuevo style |
| Login (`lncrY`) | exists | Rediseñar |
| Prompt List (`9KnO1`) | exists | Rediseñar |
| Prompt Editor (`T8o30`) | exists | Rediseñar + agregar diff sub-state |
| API Keys (`AFHK7`) | exists | Rediseñar + agregar metrics dashboard |
| Settings — Integrations | NEW | Crear con backfill UI de P12 |
| Settings — Profile | NEW | Crear (placeholder mínimo) |
| Empty / Loading / Error | NEW | Component states (1 frame compartido) |
| Roadmap (`jM1Sr`) | exists | Mantener (es interno, no se ve en producto) |

## 9. Estado del Pencil MCP

Bugs detectados en sesión 2026-05-04 que bloquean ejecución
automatizada:
- `set_variables` con array u objeto JSON → "Variable '0' does
  not have a valid definition" (parsea cada caracter de la
  string serializada).
- `find_empty_space_on_canvas` con `width: 1440` numérico →
  "width must be a number".
- `batch_get` con patterns o nodeIds → "you are probably
  referencing the wrong .pen file" (incluso después de
  `open_document`).
- `get_guidelines` con `params: { ... }` → ignora params,
  sigue mostrando required params.

**Workaround**: ejecutar el rediseño manualmente desde el editor
Pencil con este doc como referencia, OR esperar a que se
publique versión nueva del MCP que arregle el encoding de
parámetros estructurados.

## 10. Out of scope (Pγ)
- Mobile-first redesign (V1 es desktop-first; mobile responsive
  pero no exige rediseño).
- Dark mode (definir tokens pero no implementar — V2).
- Animaciones / micro-interactions (sumar después de Pγ).
- Internacionalización (V1 = español + inglés mixto, V2 = i18n
  formal).
- Custom illustrations (usar emoji o lucide icons).
