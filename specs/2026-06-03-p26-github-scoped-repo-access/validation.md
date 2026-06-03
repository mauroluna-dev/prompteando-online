# P26 — Conexión GitHub con acceso acotado a un repo · Validation

Pre-condiciones:
- `docker compose up -d postgres redis` healthy.
- Migración de `connection_method` aplicada (`bun run db:migrate`).
  Verificar en psql: `\d user_github_connection` muestra
  `connection_method | text | not null default 'oauth'`.
- `.env` con `ENCRYPTION_KEY` ya existente. **Sin env nuevas.**
- Sesión activa en el browser.
- Una cuenta GitHub donde puedas crear un **fine-grained PAT** acotado a
  un repo de prueba (`tu-usuario/prompteando-test`).

## Static checks (pre-flight)

```bash
bun run lint        # 0 warnings
bunx tsc --noEmit   # 0 errors
bun test            # all pass (incluye command + adapter + entity nuevos)
bun run build       # ok
```

## Migración

- Filas previas (si las hay) quedan con `connection_method = 'oauth'`
  automáticamente. Confirmar con
  `select user_id, connection_method from user_github_connection;`.

## Funcional — modo PAT (camino nuevo)

### 1. Crear el token en GitHub
- `https://github.com/settings/personal-access-tokens/new`
- Repository access → **Only select repositories** → `prompteando-test`.
- Repository permissions → **Contents: Read and write** (Metadata: Read
  se agrega solo).
- Generar y copiar el `github_pat_...`.

### 2. Conectar
- `/settings/integrations` → opción **"Elegir un solo repo"**.
- Pegar `owner/repo` = `tu-usuario/prompteando-test` + el token.
- Submit → toast de éxito; el estado pasa a "Conectado" mostrando
  **"Acceso solo a `tu-usuario/prompteando-test`"** y método "token
  acotado".
- En DB: `connection_method = 'pat'`, `repo_full_name` correcto,
  `encrypted_access_token` no vacío, `scopes = {}`.

### 3. Auto-commit
- Crear/guardar un prompt → en el repo `prompteando-test` aparece
  `prompts/<slug>.md` con la versión. (Confirma que el PAT con
  Contents:write basta para la Contents API.)

### 4. Backfill
- Si la cuenta tenía prompts previos, al conectar se dispara el backfill;
  verificar el progreso en la UI y los commits backdated en el repo.

### 5. Errores (cada uno NO debe guardar connection)
- Token random/inválido → `error: token-invalid`, copy claro.
- Repo al que el token **no** tiene acceso → `repo-access-denied`.
- Token con solo `Contents: Read` (sin write) → `repo-write-denied`.
- `repoFullName` mal formado (`sinslash`) → 422 de validación Zod.

## Funcional — modo OAuth (camino existente, regresión)

### 6. La opción de siempre sigue intacta
- `/settings/integrations` → **"Acceso completo (recomendado)"** →
  flujo OAuth `repo` → crea/asegura `prompteando-<login>` + README.
- En DB: `connection_method = 'oauth'`. Estado conectado muestra el copy
  de acceso completo. Auto-commit y backfill como antes.

### 7. Cambio de método
- Estando conectado por OAuth, **Desconectar** → reconectar por PAT (y
  viceversa). Solo hay un connection por usuario; el segundo connect
  reemplaza al primero.

## Accesibilidad / copy

- El selector de método es navegable por teclado (tabs con
  `aria-pressed` o radios con `fieldset/legend`).
- Inputs del form PAT con `<Label htmlFor>`; el input del token es
  `type="password"`.
- Copy sin jerga: "token acotado", "acceso solo a este repo", guía paso
  a paso. Sin "scope", "fine-grained PAT" crudo en el cuerpo (puede ir
  como aclaración entre paréntesis).

## Checklist de cierre

- [ ] Migración aplicada y filas viejas en `'oauth'`.
- [ ] PAT: conectar / commit / backfill / desconectar OK.
- [ ] Los 3 errores muestran copy correcto y no guardan nada.
- [ ] OAuth sigue funcionando sin cambios (regresión verde).
- [ ] `lint` + `tsc` + `test` + `build` verdes.
- [ ] roadmap.md actualizado (P26 done, P27 GitHub App como follow-up).
