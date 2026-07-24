# Local Setup and Testing (Quick)

This guide explains how to get the backend running locally for development and how to run tests.

Prerequisites
- Node.js 20+
- Docker & Docker Compose

One-step local setup

1. From the `backend` folder run:

```bash
npm run setup
```

What `npm run setup` does
- Copies `.env.local` into each service as `.env` (replacing `<service>` placeholders)
- Installs root dependencies and builds shared packages
- Starts infrastructure containers from `docker-compose.yml` (Postgres, Redis, Kafka, Elasticsearch)

Start individual services (for development)

```bash
cd services/auth && npm run dev
```

Run all infrastructure only

```bash
npm run dev
```

Initialize databases and seed sample data

```bash
npm run db:init
npm run db:seed
```

Or run both in one step:

```bash
npm run db:setup
```

Stop infra

```bash
npm run dev:down
```

Testing
- Integration tests:

```bash
npm run test:integration
```

- E2E tests:

Look into `tests/e2e` for the specific runner. Typically:

```bash
cd tests/e2e && npm install && npm test
```

Notes on external services
- If you don't have AWS, Stripe, etc. available, use local alternatives or mocks:
  - AWS: run LocalStack in Docker and point `AWS_*` env vars to it
  - Stripe: use stripe-mock or set `STRIPE_SECRET_KEY` to a test key
  - Twilio / SendGrid: use test credentials or disable integrations via env toggles

If something fails
- Check `docker-compose ps` and container logs (`docker-compose logs -f`) for failing services.
- Confirm each service has a populated `.env` file in its folder.

If you want, I can:
- Add a `docker-compose.local.yml` with LocalStack and stripe-mock
- Run the setup here and try running the integration tests
