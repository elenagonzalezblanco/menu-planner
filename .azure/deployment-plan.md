# Email reliability deployment

Status: Deployed and Verified

## 1. Scope

Modify the existing menu planner. Add a durable email outbox, idempotent requests,
retry/status UI and tests. Preserve menus, recipes, accounts and existing services.

## 2. Azure context

- Subscription: `5fd714fb-9dfc-4176-ac01-ef4087e8c47f`
- Resource group: `elenagbgpersonal`
- App Service: `micocina`, existing location and plan
- Registry: `menuplannercr.azurecr.io`
- Database: existing PostgreSQL; additive email table only
- Email: existing Azure Communication Services configuration
- Endpoint: https://micocina.azurewebsites.net

## 3. Recipe

AZCLI, existing Dockerfile and ACR build. No new infrastructure or credentials.
Build an immutable image tag and point the existing App Service to that image.
Retain the previous image digest for rollback:
`menuplannercr.azurecr.io/menu-planner@sha256:5d3d3f36e7e4a193d04ca840f6a9ce2e74b778b381ee8f4df055b9875873dd00`.

## 4. Requirements

Persist requests before sending. Retry transient failures without silently losing
the request. Never display acceptance as inbox delivery. Do not send real test
emails to any recipient other than Elena's existing profile address.

## 5. Validation

Frontend and backend typechecks/builds, focused outbox tests, mocked browser tests
for offline/reload/retry and duplicate submission, then production health check
and a single real delivery with an idempotent replay.

## 6. Execution

The user requested the live application fix; use existing subscription, region,
service tier and deployment mechanism. No changes to billing tier, identity,
network rules or menu content. Roll back the image if health validation fails.

## 7. Validation proof

2026-09-13:

- Frontend typecheck and build passed on Node 20.
- `pnpm --filter @workspace/menu-semanal exec tsx --test src/lib/email-outbox.test.ts`: 8 passed.
- `EMAIL_TEST_DATABASE_URL=postgresql://localhost/postgres pnpm --filter @workspace/api-server run test:email`: 16 passed, including real isolated PostgreSQL, fake ACS transport, transient startup failures and shutdown.
- `pnpm --filter @workspace/api-server build`: passed.
- Full backend typecheck reports only pre-existing errors in untouched `routes/mercadona.ts`; changed email files have no diagnostics.
- Targeted backend typecheck passed: `pnpm --filter @workspace/api-server exec tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --strict --esModuleInterop --skipLibCheck src/lib/email-content.ts src/lib/email-outbox.ts src/lib/azure-email.ts src/lib/email-service.ts src/routes/email.ts`.
- Browser: offline persistence across reload, lost response with identical UUID on 10 attempts and one job, explicit server retry and provider acceptance, saved-menu send, shopping send with manual extras, and 2 clicks 1000ms apart creating one job.
- Azure target and registry are healthy; ACS and DB settings exist (values not logged).
- Existing hosting is F1, Always On unavailable. No paid upgrade; durable jobs resume on wake.
- `git diff --check`: passed.
- AZCLI 2.84.0 authenticated to the existing enabled subscription. ACR task-list and manifest-read permissions verified. No Bicep/ARM, RBAC, region, tier or policy-scope changes, so template/what-if/new-resource policy checks are not applicable.
- Local Docker is unavailable; the exact container build will be validated by ACR before the App Service image is changed.
- Container validation passed: `az acr build --subscription 5fd714fb-9dfc-4176-ac01-ef4087e8c47f --registry menuplannercr --image menu-planner:email-reliability-20260913 --file Dockerfile --platform linux/amd64 --no-logs .`; run `nh1c` succeeded at `2026-09-13T17:55:41Z`.
- Release digest: `sha256:74ac1b527b532584e2b02e3a8859bdd133f1661f1a548a284b46cd17dde1bc18`.

## 8. Production verification

- App Service now references `menuplannercr.azurecr.io/menu-planner:email-reliability-20260913`.
- At `2026-09-13T17:56:57Z`, real delivery `20f5e46f-af3b-4ed3-a972-3166857d7609` reached `succeeded`.
- Replays before/after completion returned the same job; changed payload returned 409;
  another user's lookup returned 404. No duplicate job was created.
- Frontend bundle `/assets/index-eH1DSn6p.js` contains the new durable email UI.
- `/api/healthz` confirms the app and database are healthy.
- The recovered historical menu still matches its saved pre-14:00 snapshot.
- Existing F1 tier and Always On setting are unchanged. No new infrastructure.
