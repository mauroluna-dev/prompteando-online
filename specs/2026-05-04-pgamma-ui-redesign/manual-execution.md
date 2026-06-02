# Pγ — Manual Pencil Execution Guide

> Este doc te guía a recrear el rediseño Pγ en Pencil.app a mano,
> en caso de que el MCP siga teniendo bugs de encoding en
> `set_variables`/`find_empty_space`/`batch_get`/`get_guidelines`.
> El MCP `batch_design` SÍ funciona y se puede combinar con esta
> guía si querés acelerar.

> Una primera referencia ya quedó en `untitled.pen` como
> frame `Login (Pγ)` (id `ro9Dv`), creada via MCP en sesión
> 2026-05-04 — está posicionada en `x: 5820, y: 0` para no pisar
> los frames existentes.

## 1. Setup del proyecto

1. Abrir el `.pen` activo (`untitled.pen`).
2. Crear nueva página: "Pγ Redesign".
3. Mover los 6 frames existentes (`MUZm8`, `jM1Sr`, `lncrY`,
   `9KnO1`, `T8o30`, `AFHK7`) a página "Legacy V0" para
   referencia. Los rediseños Pγ viven en la página nueva.

## 2. Definir Variables (manualmente desde el Variables panel)

> Ojo: el MCP tiene bug en `set_variables` (rechaza arrays/
> objetos). Esto se hace a mano desde el panel.

### Colors
| Nombre | Tipo | Valor |
|--------|------|-------|
| `surface-elevated` | color | `#FFFFFF` |
| `surface-primary` | color | `#FFFFFF` |
| `surface-secondary` | color | `#FAFAFA` |
| `surface-subtle` | color | `#F4F4F5` |
| `foreground-primary` | color | `#0A0A0A` |
| `foreground-secondary` | color | `#737373` |
| `foreground-muted` | color | `#A1A1AA` |
| `border-subtle` | color | `#E5E5E5` |
| `border-strong` | color | `#D4D4D8` |
| `accent-primary` | color | `#18181B` |
| `accent-secondary` | color | `#4F46E5` |
| `success-fg` | color | `#15803D` |
| `success-bg` | color | `#DCFCE7` |
| `warning-fg` | color | `#A16207` |
| `warning-bg` | color | `#FEF3C7` |
| `destructive-fg` | color | `#B91C1C` |
| `destructive-bg` | color | `#FEE2E2` |
| `info-fg` | color | `#1D4ED8` |
| `info-bg` | color | `#DBEAFE` |
| `diff-add-bg` | color | `#DCFCE7` |
| `diff-add-fg` | color | `#14532D` |
| `diff-del-bg` | color | `#FEE2E2` |
| `diff-del-fg` | color | `#7F1D1D` |
| `chart-1` | color | `#18181B` |
| `chart-2` | color | `#4F46E5` |
| `chart-3` | color | `#A1A1AA` |

### Numbers
| Nombre | Tipo | Valor |
|--------|------|-------|
| `radius-sm` | number | `8` |
| `radius-md` | number | `12` |
| `radius-lg` | number | `16` |
| `radius-pill` | number | `9999` |

### Fonts (string)
> Pencil tiene un set fijo (Geist, Inter, Geist Mono). En la
> implementación React/Tailwind se reemplazan por Cal Sans /
> Numans / Geist Mono via `@fontsource/*`. En Pencil usamos los
> equivalentes más cercanos.

| Nombre | Valor en Pencil | Reemplazo en código |
|--------|-----------------|---------------------|
| `font-display` | Geist | Cal Sans |
| `font-body` | Inter | Numans |
| `font-mono` | Geist Mono | Geist Mono |

## 3. Crear los 4 frames Pγ NO cubiertos por P17/P18

### Frame 1: Login

Ya está creado por el MCP (`ro9Dv`, "Login (Pγ)") en
`x: 5820, y: 0`. Estructura:

```
Login (1440×900, fill: surface-secondary)
├── Nav (horizontal, fill, 64h, padding [0,32], fill: surface-elevated, border-bottom subtle)
│   ├── Brand text: "prompteando" (Geist 18, weight 600)
│   └── NavRight (horizontal, gap 16)
│       ├── "Docs" (Inter 14, foreground-secondary)
│       └── "GitHub" (Inter 14, foreground-secondary)
└── Body (vertical, fill, fill_container h, padding [80,0], center align)
    └── Center (480w, fit_content, gap 32, vertical, center align)
        ├── HeroBlock (vertical, fill, gap 12, center)
        │   ├── Title: "Welcome to prompteando" (Geist 36/600, lineHeight 1.1)
        │   └── Subtitle: "Version your prompts. Never lose one again." (Inter 16, lineHeight 1.5)
        ├── Card (vertical, fill, padding 32, gap 16, fill: surface-elevated, radius-md, border subtle)
        │   ├── GitHub Button (horizontal, fill, h 48, fill: accent-primary, radius-sm)
        │   │   ├── Icon: lucide github 20×20 white
        │   │   └── Label: "Continuar con GitHub" (Inter 15/500, white)
        │   ├── Google Button (horizontal, fill, h 48, fill: surface-elevated, border strong, radius-sm)
        │   │   ├── Icon: lucide globe 20×20 dark
        │   │   └── Label: "Continuar con Google" (Inter 15/500, dark)
        │   ├── Divider (1h, fill: border-subtle)
        │   └── Microcopy: "Solo leemos los repos que vos crees con prompteando. Auditá nuestro código en GitHub." (Inter 12, foreground-muted, center, lineHeight 1.4)
        └── Footer text: "¿Sin cuenta de GitHub o Google? Próximamente más opciones." (Inter 13, foreground-muted, center)
```

### Frame 2: Landing (rediseño)

Crear en `x: 7320, y: 0`. Tamaño `1440 × 3200` (long-form).

```
Landing (vertical, fill: surface-secondary)
├── Nav (igual que Login pero con "Sign in" botón a la derecha)
├── Hero section (vertical, fill, padding [120, 32, 80], gap 32, center)
│   ├── Eyebrow: "v1.0 — gratis, sin vendor lock-in" (Geist Mono 12, accent-secondary, uppercase)
│   ├── H1: "Versioná tus prompts.\nNunca pierdas la última que andaba." (Geist 64/600, lineHeight 1.05, center)
│   ├── Subtitle: "Cada Save crea una versión inmutable. Cada prompt expone un endpoint que consumís desde n8n, curl, fetch. Si conectás GitHub, todo replica a TU repo." (Inter 18, foreground-secondary, center, max-width 720)
│   └── CTA group (horizontal, gap 12)
│       ├── Primary CTA: "Empezar gratis" → fill accent-primary
│       └── Secondary: "Ver demo" → outline
├── Hero screenshot (full-bleed con padding container 80, gradient bg)
│   └── Placeholder de screenshot del editor con diff
├── How it works (3-step horizontal cards)
├── Built for zero friction (4-card grid)
├── Tu historial, tu repo (split: text + GitHub repo screenshot)
├── Tech stack (logos de Bun + Postgres + Redis + Drizzle + GitHub)
└── Footer (links docs, GitHub, contacto)
```

### Frame 3: Prompt List (rediseño)

Crear en `x: 5820, y: 1100`. Tamaño `1440 × 900`.

```
PromptList (vertical, fill: surface-secondary)
├── Nav (con tabs "Prompts" active, "API Keys", "Settings", + avatar dropdown)
├── PageHeader (horizontal, padding 32, justify-between, align-center)
│   ├── Left (vertical, gap 4)
│   │   ├── H1: "Your Prompts" (Geist 32/600)
│   │   └── Subtitle: "4 prompts · 2 synced to GitHub" (Inter 14, foreground-secondary)
│   └── Right (horizontal, gap 12)
│       ├── Search input (240w, with lucide search icon, placeholder "Search…")
│       ├── Filter dropdown: "All" / "Synced" / "Not synced" / "Templates"
│       └── Primary button: "+ New Prompt"
└── Grid (vertical, padding [0, 32, 32], gap 16)
    └── PromptCard × N (horizontal, fill, padding 20, gap 16, fill: surface-elevated, border subtle, radius-md)
        ├── Icon (40×40 rounded, slug color hash)
        ├── Body (vertical, fill, gap 4)
        │   ├── Name: "Onboarding Welcome" (Geist 16/600)
        │   ├── Slug: "onboarding-welcome" (Geist Mono 13, foreground-muted)
        │   └── Meta row (horizontal, gap 16, foreground-secondary 13)
        │       ├── "v3 · current"
        │       ├── "Updated 2h ago"
        │       └── GitHubSyncBadge inline (icon + "synced" pill verde)
        └── Actions (horizontal, gap 8)
            ├── Open link (chevron-right icon)
```

### Frame 4: Settings — Profile

Crear en `x: 7320, y: 1100`. Tamaño `1440 × 900`.

```
SettingsProfile (vertical, fill: surface-secondary)
├── Nav
├── Layout horizontal (sidebar 280 + content fill)
│   ├── SettingsSidebar (vertical, padding [32, 0, 32, 32], gap 4)
│   │   ├── SidebarSectionTitle: "Settings"
│   │   ├── SidebarItemActive: "Profile" + lucide user icon
│   │   ├── SidebarItem: "API Keys" + lucide key icon
│   │   ├── SidebarItem: "Integrations" + lucide plug icon
│   │   └── SidebarItem: "Billing" (greyed, "soon")
│   └── Content (vertical, padding 32, gap 24)
│       ├── PageHeader (vertical, gap 4)
│       │   ├── H1: "Profile" (Geist 32/600)
│       │   └── Subtitle: "Tu identidad en prompteando."
│       ├── Card (Account)
│       │   ├── Header: "Account" (Geist 18/600) + description
│       │   └── Content
│       │       ├── Field row: Avatar (lg, 64×64 circle) + Edit button
│       │       ├── InputGroup: "Email" disabled = "user@example.com"
│       │       ├── InputGroup: "GitHub login" disabled = "octocat"
│       │       └── InputGroup: "Account created" disabled = "May 1, 2026"
│       └── Card (Danger zone, border destructive)
│           ├── Header: "Delete account" (Geist 18/600, destructive-fg)
│           └── Body: warning copy + "Delete my account" destructive button
```

### Frame 5: Settings — Integrations (con backfill UI de P12)

Crear en `x: 8820, y: 1100`. Tamaño `1440 × 900`.

```
SettingsIntegrations (vertical, fill: surface-secondary)
├── Nav
├── Layout horizontal (sidebar 280 + content fill)
│   ├── SettingsSidebar (con "Integrations" active)
│   └── Content (vertical, padding 32, gap 24)
│       ├── PageHeader: "Integrations" + "Connect external services."
│       └── GitHub Card
│           ├── Header (horizontal): lucide github icon + "GitHub" + connected badge
│           ├── Body
│           │   ├── Connected state row:
│           │   │   ├── Account: octocat
│           │   │   ├── Repo: octocat/prompteando-octocat (link)
│           │   │   ├── Connected: May 1
│           │   │   └── Disconnect button (outline)
│           │   └── Backfill section (only if status != null)
│           │       ├── Pending: spinner + "Preparing..."
│           │       ├── Running: progress bar + "Syncing X of Y commits"
│           │       ├── Completed: green banner + "Sync complete: N commits" (sessionStorage acked)
│           │       └── Failed: error card + reason copy + reconnect CTA
└── (Future integration cards: Slack, Linear — placeholder gray cards "Coming soon")
```

## 4. Estados auxiliares (single frame)

Crear en `x: 10320, y: 0`. Tamaño `1440 × 900`.

Frame "States Reference" mostrando 6 cards lado a lado:
- Empty state (lucide icon big + heading + subtitle + CTA)
- Loading skeleton (3 grey rectangles pulsing)
- Inline error (border destructive + icon + copy + retry button)
- Toast success (green pill, lucide check)
- Toast error (red pill, lucide alert-triangle)
- Toast info (blue pill, lucide info)

## 5. Reusable components a crear (en panel Components)

Después de los frames, extraer los patrones repetidos como
componentes reusables:

- `Nav` — el header con brand + tabs + avatar
- `Card` — frame con header slot + content slot + actions slot
- `Button/Primary` — bg accent-primary, white text, h 36 default / h 48 large
- `Button/Outline` — border strong, transparent bg, dark text
- `Button/Ghost` — sin border, hover bg surface-subtle
- `InputGroup` — label + input wrapped
- `Badge/Synced` — pill verde con "synced" + lucide check
- `Badge/Syncing` — pill azul con loader pulsing
- `Badge/Failed` — pill destructive con alert-triangle
- `MetricCard` (P18) — pill stat con label arriba + value grande
- `EmptyState` — wrapper con icon + heading + subtitle + CTA slot
- `Skeleton` — placeholder grey con `animate-pulse`

## 6. Quality checklist visual

- [ ] Cada frame tiene un dominant region claro (h1 grande visible primero).
- [ ] Spacing es consistente (16/24/32 escala, no arbitrario).
- [ ] Tipografía respeta jerarquía (Geist 32+ para H1, 18 para H2/card titles, Inter 14 para body).
- [ ] Line-heights: 1.1 para H1/H2, 1.5 para body, 1.4 para captions.
- [ ] Cero hardcoded hex — todo via variables.
- [ ] Cada CTA tiene prioridad clara (1 primary por sección).
- [ ] Estados de carga/vacío/error pensados para cada surface
      data-driven.
- [ ] Mobile responsive: cada frame tiene contraparte de 375w
      single-column (después de los desktop frames).

## 7. Validación cruzada con código

Una vez armados los frames, comparar con la implementación
React de `feat/pgamma-ux-sprint`:

- Tokens CSS en `src/frontend/styles/tokens.css` ↔ Variables
  Pencil.
- Componentes shadcn/ui refactorizados ↔ Reusable components
  Pencil.
- Página `LoginPage.tsx` ↔ Frame "Login (Pγ)".
- Página `PromptListPage.tsx` ↔ Frame "Prompt List (Pγ)".
- Etc.

Si hay drift, decidir caso a caso si actualizar Pencil o el
código (por defecto el código gana cuando hay constraints
técnicas; Pencil gana en visual hierarchy y spacing).

## 8. Bugs conocidos del Pencil MCP (workarounds)

| Tool | Bug | Workaround |
|------|-----|------------|
| `set_variables` | Rechaza array u objeto JSON ("Variable '0' does not have a valid definition: '{'") | Crear variables a mano desde el panel Variables. |
| `find_empty_space_on_canvas` | "width must be a number" aunque se envía número | Calcular x/y manualmente y pasarlos directo en el insert. |
| `batch_get` | "you are probably referencing the wrong .pen file" aunque el documento esté abierto | Usar `get_screenshot` por nodeId individual; estructura via `snapshot_layout`. |
| `get_guidelines` con params | Ignora params, sigue mostrando required params | Aplicar tokens manualmente en cada `batch_design` call. |
| `get_screenshot` de frames recién creados | A veces devuelve imagen blanca | Esperar varios segundos y reintentar; o capturar manualmente desde Pencil.app. |

`batch_design` (insert/update/replace/move/delete) **funciona
correctamente** y es la herramienta que más usar.
