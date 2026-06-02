# prompteando (Python)

Cliente oficial de [Prompteando](https://github.com/mauroluna-dev/prompteando-online)
para Python. Sin dependencias (usa `urllib`).

```bash
pip install prompteando
```

```python
from prompteando import Client

stash = Client(
    api_key="po_live_...",
    base_url="https://prompts.tu-dominio.com",  # tu instancia self-hosted
)

# Traer un prompt (por label de deploy o versión)
prompt = stash.get_prompt("welcome-email", label="production")
print(prompt["content"], prompt["config"])

# Renderizar un template
rendered = stash.render(
    "welcome-email",
    vars={"nombre": "Ana", "producto": "Plan Pro"},
    label="production",
)
print(rendered["content"])         # text → string
# para prompts chat: rendered["messages"]
```

- **Caching + fallback**: `get_prompt` cachea por `cache_ttl` (60s por
  default) y sirve el último valor bueno ante 5xx / errores de red.
- **Labels / versiones**: pasá `label=...` o `version=...`.
- **Errores estrictos**: lanza `PrompteandoError` (con `status` y `body`)
  en 4xx (ej: 422 por variables faltantes).
