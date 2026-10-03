---
description: Replace the in-memory owner-scoped store with SQLite + SQLAlchemy (same interface, migrations, seed loader) for a reliable local demo
---
Implement `api/app/store_sqlite.py` with the same methods as `InMemoryRepo` (`put`, `get_owned`, `list_owned`, `delete_all`, `audit`), tables keyed by (owner_sub, type, id)
with JSON payloads, Alembic migrations, `python3 -m app.seed` loading presets/catalogs (public) and nothing personal, and `ORALCOMPASS_STORE=sqlite` switch. All existing API
tests must pass against both stores (parametrize). Never log payloads; audit rows carry ids only.
