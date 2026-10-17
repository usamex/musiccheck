# packages/shared

`openapi.json` — the machine-readable API contract, generated from the FastAPI app:

```bash
scripts/export-openapi.sh
```

Do not edit by hand. `services/api/tests/test_schema_and_contract.py` fails when it is stale.
The mobile app's `apps/mobile/src/api/types.ts` mirrors it manually for now (backlog MOB-3).
