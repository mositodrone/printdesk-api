# PrintDesk API

Order-tracking REST API for small custom-print shops (T-shirts, hoodies, caps), so
owners and staff can see what was ordered and what stage it is at.

Backend Development track, BuildLab Stage 1. Currently at **Week 1**: data model,
API spec and full CRUD on orders.

## Stack
Node.js, Express, MongoDB (Atlas), Mongoose, Zod

## Live API
<url once deployed>

Hosted on a free tier, so the first request after a period of inactivity may take
30-60 seconds while the server wakes up. Hitting `/health` first is the quickest way
to wake it.

## Endpoints (Week 1)
| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/health` | Health check | 200 |
| GET | `/orders` | List orders (filter by `status`, `customerId`; `page`, `limit`, `sort`) | 200 |
| POST | `/orders` | Create an order for an existing customer | 201 |
| GET | `/orders/:id` | Get one order | 200 |
| PATCH | `/orders/:id` | Update details (`customerId`, `dueDate`, `notes`) | 200 |
| PATCH | `/orders/:id/status` | Change status (`received`, `printing`, `ready`, `delivered`, `cancelled`) | 200 |
| DELETE | `/orders/:id` | Delete an order | 200 |

Invalid input returns 400 and a missing order returns 404. Every error uses one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [ { "field": "customerId", "issue": "customerId is required" } ] } }
```

Full request and response details are in the API spec (see Docs).

## Run locally
Requires Node 20+ and a MongoDB database (a free Atlas cluster works, or a local MongoDB).

1. `git clone <repo-url> && cd printdesk-api`
2. `npm install`
3. `cp .env.example .env` and fill in the values below
4. `npm run seed` (loads dummy customers, garment types and orders)
5. `npm run dev`

The API runs at http://localhost:3000

| Variable | Purpose | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string (required) | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/printdesk` |
| `PORT` | Port to listen on | `3000` |
| `NODE_ENV` | `development` or `production` | `development` |

| Script | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start normally |
| `npm run seed` | Wipe and reload dummy data (refuses to run with `NODE_ENV=production` unless `--force` is passed) |

All data is dummy data. No real personal information is stored.

## Try the API
Sample requests are in [`requests/orders.http`](requests/orders.http). Open it in VS Code
with the **REST Client** extension and click "Send Request" above any request. Each
request is labelled with the status code it should return, including failure cases.

**Send the first two requests before the rest:**

1. `listOrders`, which the other requests read an id from
2. `createOrder`, which the get, update, status and delete requests use

Send them in order, top to bottom. If you reload VS Code, send them again. Requests
that depend on them fail with an unresolved variable or a 400 error otherwise.

- **Local:** keep `@baseUrl` as `http://localhost:3000` (run `npm run seed` first).
- **Live:** change `@baseUrl` at the top of the file to the live URL above.

The file is plain text, so the same requests also work with curl or Postman
(Postman can import `docs/api-spec.yaml` directly):

```bash
curl http://localhost:3000/orders?status=printing
```

## Docs
In [`/docs`](docs/):
- `idea-one-pager.md`: who it is for, why this idea and stack, key decisions
- `work-plan.md`: what is delivered each week and the top risks
- `erd.png` (source: `erd.dbml`): entity relationship diagram
- `design-decisions.md`: the reasoning behind the data model and API choices
- `api-spec.yaml`: OpenAPI spec for every endpoint

Reviewer copy of the Week 1 documents: <Google Drive folder link>

## Project structure
```
docs/            design documents (one-pager, plan, ERD, spec, decisions)
requests/        sample requests (.http)
src/
  config/        environment loading and database connection
  models/        Mongoose schemas (Order, Customer, GarmentType, Staff)
  validators/    Zod rules for request bodies and query parameters
  routes/        URL and method to handler mapping
  controllers/   request handling logic
  middleware/    validation, 404 and error handling
  utils/         shared helpers
  seed/          dummy data loader
```

## Roadmap
- **Week 1:** data model, API spec, CRUD on orders (this tag: `week-1`)
- **Week 2:** staff authentication and roles, order items and customer endpoints, stronger validation
- **Week 3:** automated tests, API docs, security notes, final deployment
