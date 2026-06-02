# Política de seguridad

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en Prompteando, **no abras
un issue público** ni la publiques antes de que esté resuelta.

Reportala de forma privada por alguna de estas vías:

- **GitHub Security Advisories** (preferido): pestaña *Security* →
  *Report a vulnerability* en el repo. Es privado y permite coordinar
  el fix.
- **Email**: mauroluna.dev@gmail.com con el asunto
  `[SECURITY] Prompteando`.

Incluí, en lo posible:

- Descripción de la vulnerabilidad y su impacto.
- Pasos para reproducirla (o un PoC).
- Versión / commit afectado.

## Qué esperar

- Acuso recibo dentro de **72 hs**.
- Te mantengo al tanto del avance y coordino una fecha de divulgación.
- Una vez resuelta, se publica un advisory y se te da crédito si querés.

## Alcance

Áreas especialmente sensibles en este proyecto:

- **Autenticación y sesiones** (Auth.js / OAuth).
- **API Keys** y el endpoint público `/v1/prompts/:slug`.
- **Cifrado at-rest** del token de GitHub (`ENCRYPTION_KEY`,
  AES-256-GCM vía `CryptoPort`).
- **Rate limiting** y abuso del API público.

## Buenas prácticas para quien self-hostea

- Generá `AUTH_SECRET` y `ENCRYPTION_KEY` con `openssl rand -base64 32`
  y mantenelos secretos. Rotar `ENCRYPTION_KEY` sin re-cifrar las filas
  existentes rompe a todos los usuarios con GitHub conectado.
- Nunca commitees tu `.env` (ya está en `.gitignore`).
- Serví siempre detrás de HTTPS en producción.
