# P26 — Conexión GitHub con acceso acotado a un repo · Requirements

## Por qué esta fase

Hoy la integración GitHub (P10–P12) tiene **un solo camino**: OAuth App
con scope `repo`, que da read+write a **todos** los repos del usuario y
auto-crea `prompteando-<login>`. Es el flow más simple (un click) y es
el correcto para el persona driver no-coder.

Pero hay un subconjunto de usuarios —los "paranoicos", devs con repos
sensibles, equipos con políticas— a los que darle acceso a *todos* sus
repos a una herramienta de terceros les frena la conexión. Para ellos
queremos una **segunda opción, aditiva**: conectar dando acceso a **un
solo repo elegido por ellos**.

GitHub no permite acotar una OAuth App por-repo (el scope `repo` es
todo-o-nada). El acceso por-repo solo existe con **GitHub App** o con
**fine-grained Personal Access Token (PAT)**. Esta fase implementa el
camino **PAT**, porque:

- Es un **bearer token**: entra por el mismo `gateway.commitVersion(...)`
  que ya usamos. Reusa ~90% del código (jobs de commit y backfill **no
  se tocan**).
- **Cero infra nueva** para el operador del deploy (no hay que registrar
  una GitHub App ni manejar clave privada / webhooks de instalación).
  Esto importa para un proyecto **open source self-hosteable**: cada
  self-host funcionaría sin registrar nada.
- Le da al usuario paranoico **control total**: él crea el token, lo
  acota a 1 repo con permiso mínimo (`Contents: Read and write`), lo ve
  y lo revoca cuando quiere.

La **GitHub App** queda documentada como mejora futura (ver
`## Alternativa considerada` abajo y roadmap P27).

## Aclaración de alcance (vs. el pedido original)

El pedido habló de "el otro método de **sign-in** con GitHub". El
**login** (Auth.js, scope `read:user user:email`) NO da acceso a repos
y no cambia. Lo que se elige acá es el **método de conexión de la
integración** (Settings → Conectar GitHub), que es lo que provisiona el
repo espejo. Esta fase agrega una segunda forma de **conectar la
integración**, no una segunda forma de loguearse.

## Decisiones tomadas (sesión 2026-06-03)

1. **Aditivo, no reemplazo.** La opción OAuth `repo` actual queda
   intacta y se presenta como la recomendada / más simple. PAT es la
   alternativa "para los más cuidadosos".

2. **Mecanismo = fine-grained PAT**, no GitHub App (ver razones arriba).
   GitHub App se difiere a P27.

3. **El usuario elige el repo.** En modo PAT no auto-creamos
   `prompteando-<login>`: el usuario indica `owner/repo` (el repo al que
   le dio acceso al crear el token). Puede ser un repo existente suyo o
   de una organización donde tenga permisos.

4. **No tocamos el repo del usuario más de lo necesario.** En modo PAT
   **no** escribimos `README.md` en la raíz (sería intrusivo en un repo
   ajeno que ya tiene su contenido). Los prompts aparecen en
   `prompts/<slug>.md` recién en el primer save / backfill, igual que
   hoy. (En modo OAuth seguimos asegurando el README como hasta ahora,
   porque ahí el repo es nuestro `prompteando-<login>`.)

5. **Permiso mínimo declarado al usuario:** `Repository access → Only
   select repositories → (1 repo)` + `Repository permissions → Contents:
   Read and write` (Metadata: Read es obligatorio de base en GitHub). Lo
   comunicamos con instrucciones paso a paso en la UI.

6. **Validación al conectar:** el token debe (a) ser válido
   (`GET /user`), (b) tener acceso al `owner/repo` indicado
   (`GET /repos/{owner}/{repo}`), y (c) permiso de escritura
   (`permissions.push === true`). Si algo falla, error claro y no se
   guarda nada.

7. **Almacenamiento:** reusa la tabla `user_github_connection` y el
   cifrado AES-256-GCM existente (`ENCRYPTION_KEY`). El PAT se guarda en
   `encrypted_access_token` igual que el token OAuth. **Sin env nuevas.**

8. **Distinguir el método:** nueva columna `connection_method`
   (`'oauth' | 'pat'`, default `'oauth'` para filas existentes). Se usa
   en la UI (mostrar "acceso a todos tus repos" vs "acceso solo a
   `owner/repo`") y para mensajería de desconexión.

9. **Un solo connection por usuario (como hoy).** `user_github_connection`
   tiene PK `user_id`. Cambiar de método = desconectar y reconectar. No
   soportamos OAuth + PAT simultáneos para el mismo usuario en esta fase.

10. **Backfill y auto-commit idénticos.** Los jobs solo desencriptan el
    token y commitean; son agnósticos al método. No se modifican salvo,
    a lo sumo, no-ops.

## In scope

- Columna `connection_method` + migración (default `'oauth'`).
- Dominio: `GitHubConnection` soporta `connectionMethod`; factory
  `createWithToken(...)` para PAT (sin scopes OAuth).
- Nuevo command `ConnectGitHubWithTokenCommand` (valida token + repo,
  guarda connection, dispara backfill).
- Nuevos métodos de gateway: `verifyRepoAccess(token, repoFullName)`
  → `{ defaultBranch, canWrite }`. (`getAuthenticatedUser` ya sirve.)
- Nuevos errores de dominio: `GitHubTokenInvalidError`,
  `GitHubRepoAccessDeniedError`, `GitHubRepoWriteDeniedError`.
- Ruta `POST /api/integrations/github/token` (body `{ token, repoFullName }`).
- Frontend: selector de método en `/settings/integrations` cuando NO hay
  conexión (dos caminos), formulario PAT con guía paso a paso, y estado
  conectado que muestra el método + el repo exacto.
- Copy honesto y no-coder-friendly (alineado al barrido de UX previo).
- Tests unitarios del command nuevo + del gateway (`verifyRepoAccess`)
  + render del nuevo estado de UI.

## Out of scope

- GitHub App / installation flow / minteo de tokens por JWT (→ P27).
- OAuth + PAT simultáneos para un mismo usuario.
- Auto-creación de repo en modo PAT.
- Rotación / aviso de expiración del PAT (GitHub permite tokens con
  expiración; si expira, el commit falla con `token_invalid` y ya
  mostramos ese estado — mejora de aviso proactivo queda fuera).
- Soporte de múltiples repos por conexión.

## Alternativa considerada: GitHub App (diferida a P27)

| | PAT (esta fase) | GitHub App (P27) |
|---|---|---|
| Elige repo el usuario | sí (al crear token) | sí (al instalar) |
| Token | larga vida, lo guardamos cifrado | corto, se mintea por request |
| Reusa `commitVersion` | sí, tal cual | no (auth nueva con `createAppAuth`) |
| Infra del operador | ninguna | registrar App: App ID + private key + webhook secret |
| Self-host OSS | funciona sin setup | cada deploy registra su App |
| UX | pegar token (más manual) | instalar app (más fluido) |

Recomendación: PAT primero (entrega ya el "repo específico" con bajo
riesgo y sin infra), GitHub App después si hay demanda de la UX más
fluida o de tokens efímeros. Las dos pueden coexistir como un tercer
método más adelante sin romper nada (`connection_method` ya las
distingue).
