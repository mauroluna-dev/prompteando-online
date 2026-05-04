# P10 — GitHub repo creation on connect · Validation

Pre-condiciones:
- `docker compose up -d postgres redis` healthy.
- Migration 0005 aplicada (`bun run db:migrate`). Verificar
  `\d user_github_connection` en psql.
- OAuth App de GitHub con la callback `<AUTH_URL>/api/integrations/github/oauth-callback`
  agregada (junto a la de login que ya existía).
- `.env` con `ENCRYPTION_KEY` (32 bytes en base64).
- Sesión activa en browser.
- **Una cuenta GitHub disponible** sin un repo previo
  `promptstash-<username>` (para validar el path de creación)
  + opcionalmente una segunda con un repo existente con ese nombre
  (para validar el path de reuse).

## Static checks (pre-flight)

```bash
bun run lint        # 0 warnings
bun run typecheck   # 0 errors
bun test            # all pass (incluye crypto.adapter.test.ts nuevo)
bun run build       # ok
```

## Functional checks

### 1. Boot del server con env válido

```bash
bun --hot src/interfaces/http/server.ts
# Expected: arranca sin throw. Si ENCRYPTION_KEY < 40 chars,
# env.ts debe fallar al startup con mensaje claro de Zod.
```

Probar el fail-fast removiendo temporalmente `ENCRYPTION_KEY` del
`.env`:
```bash
# Expected: el server NO arranca y muestra ZodError mencionando
# ENCRYPTION_KEY.
```
Restaurar antes de seguir.

### 2. oauth-start devuelve URL firmada

```bash
COOKIE='__Secure-authjs.session-token=<your-session>'
curl -s -H "Cookie: $COOKIE" \
  https://3010.mauroluna.dev/api/integrations/github/oauth-start | jq
# Expected:
# {
#   "url": "https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&scope=repo&state=<userId>.<expires>.<hmac>&allow_signup=false"
# }
```
Verificar:
- `url` empieza con `https://github.com/login/oauth/authorize`.
- `scope=repo` está presente.
- `state` tiene 3 segmentos separados por `.`.
- `redirect_uri` apunta a `<AUTH_URL>/api/integrations/github/oauth-callback`.
- Sin Cookie → 401.

### 3. Connection inexistente devuelve 404

```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "DELETE FROM user_github_connection;"

curl -s -o /dev/null -w "%{http_code}\n" -H "Cookie: $COOKIE" \
  https://3010.mauroluna.dev/api/integrations/github
# Expected: 404
```

### 4. Happy path: OAuth + redirect + repo creado

Manual (browser):
1. Login en `/login`.
2. Ir a `/settings/integrations`.
3. Card GitHub muestra "Conectar GitHub" (estado no-conectado) +
   warning sobre el scope `repo`.
4. Click → redirect a `https://github.com/login/oauth/authorize?...`.
5. GitHub muestra consent screen "promptstash wants to access your
   repositories" → Authorize.
6. GitHub redirige a `/api/integrations/github/oauth-callback?code=...&state=...`.
7. Server intercambia code → token, valida scope `repo`, crea repo
   y README, persiste connection, redirige a
   `/settings/integrations?connected=1`.
8. UI muestra estado conectado con `repoFullName` y banner verde
   "GitHub conectado".

**En GitHub**: ir a https://github.com/<username> → debe aparecer
repo `promptstash-<username>` privado con `README.md` que contiene
el `README_TEMPLATE`.

Verificar en DB:
```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c 'SELECT user_id, github_login, scopes, repo_full_name, default_branch, length(encrypted_access_token) FROM user_github_connection;'
# Expected:
# - 1 row con tu user_id
# - github_login = tu username
# - scopes = {repo} (o que incluya 'repo')
# - repo_full_name = "<username>/promptstash-<username>"
# - default_branch = "main"
# - length del ciphertext > 0 y NO se parece al token plaintext
```

### 5. Encrypted token NO se parece al token original

```bash
TOKEN_CT=$(docker compose exec -T postgres psql -U promptstash -d promptstash \
  -tAc "SELECT encrypted_access_token FROM user_github_connection LIMIT 1;")
echo "$TOKEN_CT"
# Expected: formato <ivB64>:<ctB64>:<authTagB64>, los 3 segmentos
# son base64. NO debe empezar con "gho_" (prefijo típico de
# GitHub OAuth tokens).
```

### 6. Reuse on collision

1. En GitHub crear manualmente un repo `promptstash-<username>`
   privado (sin README) en la misma cuenta usada en §4.
2. `DELETE FROM user_github_connection;` y revocar la app desde
   https://github.com/settings/applications (para que el OAuth pida
   consent de nuevo).
3. Repetir flow de §4.
4. Server NO debe fallar. El repo no se recrea (mantiene historia
   y created_at). El README se commitea si no estaba.

Verificar:
```bash
# El repo existente sigue ahí (compará created_at antes/después).
# La conexión está persistida.
# El README aparece en el repo (vía la UI de GitHub o
# `gh api /repos/<owner>/<repo>/contents/README.md`).
```

### 7. Disconnect

Manual (browser):
1. En `/settings/integrations` con estado conectado, click
   "Desconectar" → confirm dialog → confirmar.
2. UI vuelve a estado no-conectado.
3. En DB el row está borrado.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "Cookie: $COOKIE" \
  https://3010.mauroluna.dev/api/integrations/github
# Expected: 204 (idempotent — repetir 2 veces, ambas dan 204)

docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "SELECT count(*) FROM user_github_connection;"
# Expected: 0
```

**Importante**: el repo en GitHub NO se borra y el token sigue
válido en GitHub hasta que el usuario lo revoque manualmente desde
https://github.com/settings/applications. Documentar este
comportamiento en la UI ("Tus prompts en el repo no se borran;
podés revocar el token manualmente en GitHub").

### 8. State HMAC: rechazo de tampering

```bash
# State con HMAC inválido
curl -s -L -o /dev/null -w "%{url_effective}\n" \
  "https://3010.mauroluna.dev/api/integrations/github/oauth-callback?code=fakecode&state=user-id.9999999999999.tampered"
# Expected: redirige a /settings/integrations?error=invalid-state
```

```bash
# State expirado: tomar un state válido y modificar el timestamp a
# un valor pasado (ej. Date.now() - 86400000), recalcular sin la
# clave (HMAC quedará inválido) → falla con bad signature.
# Si querés probar específicamente "expired" con HMAC válido, hay
# que firmar manualmente con el AUTH_SECRET — opcional.
```

### 9. Scope insuficiente

Simular un OAuth response sin `repo`. Como GitHub solo devuelve los
scopes que el usuario autorizó, esto puede pasar si el usuario
revoca permisos en el medio del flow. Difícil de reproducir
manualmente; cubrir con test unitario en
`src/application/commands/__test__/connect-github.command.test.ts`:
- Fake `gateway.exchangeCodeForToken` → returns
  `{ accessToken: "x", scopes: ["read:user"] }`.
- Esperar `GitHubInsufficientScopeError(["repo"])`.
- Verificar que `repo.save` NUNCA se llamó.

```bash
bun test src/application/commands
# Expected: el test pasa
```

### 10. Idempotencia del connect (re-conectar)

Después de §4, sin disconnect, gatillar el flow OAuth de nuevo:
1. `/settings/integrations` mostraría estado conectado, así que
   simulá yendo manualmente a `/api/integrations/github/oauth-start`
   → seguir el redirect → completar OAuth.
2. Server procesa: `GitHubConnection.create(...)` se persiste vía
   `repo.save` que hace upsert por PK.
3. Resultado: 1 sola row, mismo `user_id`, posiblemente nuevo
   `encrypted_access_token` (porque el token nuevo es distinto al
   anterior — GitHub emite uno nuevo por authorize).
4. Repo no se recrea (reuse path).

```bash
docker compose exec -T postgres psql -U promptstash -d promptstash \
  -c "SELECT count(*) FROM user_github_connection WHERE user_id = '<your-id>';"
# Expected: 1
```

### 11. Crypto roundtrip y tampering

Cubierto por test unitario en
`src/infrastructure/crypto/__test__/bun-crypto.adapter.test.ts`:
- `decrypt(encrypt(plain)) === plain` para varios largos (1 char,
  típico token GitHub ~40 chars, blob de 1KB).
- `encrypt("a") !== encrypt("a")` (IV random asegura ciphertexts
  distintos).
- Cambiar 1 byte del ciphertext → `decrypt` throws.
- Cambiar el authTag → `decrypt` throws.
- Si `ENCRYPTION_KEY` decodea a ≠ 32 bytes → constructor del
  adapter throws (test específico).

```bash
bun test src/infrastructure/crypto
# Expected: all pass
```

### 12. View no expone el token ni los scopes internos

```bash
curl -s -H "Cookie: $COOKIE" \
  https://3010.mauroluna.dev/api/integrations/github | jq
# Expected JSON keys: userId, githubLogin, repoFullName,
# defaultBranch, connectedAt.
# NO debe contener: encryptedAccessToken, scopes.
```

## Acceptance / merge gate

- [ ] Static checks (lint+typecheck+test+build) verdes.
- [ ] §4 happy path completado end-to-end con repo visible en GitHub.
- [ ] §5 confirma que el token se guarda encriptado (no plaintext).
- [ ] §6 reuse-on-collision validado.
- [ ] §7 disconnect funciona idempotente y no borra el repo.
- [ ] §8 state HMAC rechaza tampering.
- [ ] §9 scope insuficiente cubierto con test unitario.
- [ ] §11 crypto roundtrip y tampering pasan tests.
- [ ] §12 confirma que `encryptedAccessToken` no leakea al frontend.
- [ ] `.env.example` actualizado documentando que `ENCRYPTION_KEY`
      ahora es required.
- [ ] Pre-push hook verde antes de pushear el branch.

Nada de lo siguiente es necesario para mergear (queda para P11+):
- Auto-commit on save de versiones.
- Backfill de prompts existentes.
- Detección automática de token revocado externamente (handler para
  `Bad credentials` cuando se intente commitear).
- Conexión a organizaciones GitHub.
- Toggle público/privado del repo.
