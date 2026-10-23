# PrintDesk API

Order-tracking REST API for small custom-print shops (T-shirts, hoodies, caps), so
owners and staff can see what was ordered and what stage it is at.

Backend Development track, BuildLab Stage 1. Currently at **Week 2**: authentication,
authorisation, order items and customers, on top of the Week 1 order endpoints.

## Stack
Node.js, Express, MongoDB (Atlas), Mongoose, Zod, bcryptjs, JSON Web Tokens

## Live API
https://printdesk-api.onrender.com

Quick checks: [`/health`](https://printdesk-api.onrender.com/health) (public). Everything
else needs a login: see Authentication below.

Hosted on a free tier, so the first request after a period of inactivity may take
30-60 seconds while the server wakes up. Hitting `/health` first is the quickest way
to wake it.

## Authentication
Sign up or log in to get a token, then send it as `Authorization: Bearer <token>`.
Tokens expire after 1 hour. Public routes: `/`, `/health`, `/auth/signup`, `/auth/login`.

```bash
# 1. log in as the seeded owner
curl -X POST https://printdesk-api.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"owner-password-123"}'

# 2. use the token from the response
curl https://printdesk-api.onrender.com/orders \
  -H "Authorization: Bearer <token>"
```

Seeded dummy accounts (test data only, created by `npm run seed`):

| Email | Password | Role |
|---|---|---|
| owner@example.com | owner-password-123 | owner |
| staff.one@example.com | staff-password-123 | staff |
| staff.two@example.com | staff-password-123 | staff |

Sign-up (`POST /auth/signup`) always creates a `staff` account. 401 means you are not
logged in or the token is invalid or expired; 403 means you are logged in but not allowed.

## Roles and ownership
- **Any logged-in staff member:** read orders, items, customers and garment types; create orders
  and customers; change an order's status.
- **Owner, or the staff member who created the order (`handledBy`):** edit or delete the
  order and add or remove its items. Seeded orders with no handler can be changed by owners only.
- **Owner only:** delete a customer.

## Endpoints
| Method | Path | Purpose | Access | Success |
|---|---|---|---|---|
| GET | `/` | API name and endpoint index | Public | 200 |
| GET | `/health` | Health check | Public | 200 |
| POST | `/auth/signup` | Create a staff account | Public | 201 |
| POST | `/auth/login` | Log in, receive a token | Public | 200 |
| GET | `/orders` | List orders (filter by `status`, `customerId`; `page`, `limit`, `sort`) | Logged in | 200 |
| POST | `/orders` | Create an order (you become its handler) | Logged in | 201 |
| GET | `/orders/:id` | Get one order | Logged in | 200 |
| PATCH | `/orders/:id` | Update details (`customerId`, `dueDate`, `notes`) | Owner or handler | 200 |
| PATCH | `/orders/:id/status` | Change status | Logged in | 200 |
| DELETE | `/orders/:id` | Delete an order and its items | Owner or handler | 200 |
| GET | `/orders/:id/items` | List an order's items | Logged in | 200 |
| POST | `/orders/:id/items` | Add an item (garment, size, colour, quantity) | Owner or handler | 201 |
| DELETE | `/orders/:id/items/:itemId` | Remove an item | Owner or handler | 200 |
| GET | `/garment-types` | List garment types (ids, sizes and colours to use when adding items) | Logged in | 200 |
| POST | `/customers` | Create a customer | Logged in | 201 |
| GET | `/customers/:id` | Get one customer | Logged in | 200 |
| GET | `/customers/:id/orders` | List a customer's orders | Logged in | 200 |
| DELETE | `/customers/:id` | Delete a customer (409 if they have orders) | Owner only | 200 |

Full request and response details are in the API spec (see Docs).

## Errors
Every error uses one shape and never includes a stack trace:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [ { "field": "customerId", "issue": "customerId is required" } ] } }
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | Bad input, malformed id, unknown field, unknown reference |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` | No or bad token, wrong email or password |
| 403 | `FORBIDDEN` | Logged in but not allowed |
| 404 | `ORDER_NOT_FOUND`, `ITEM_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `NOT_FOUND` | Record or route does not exist |
| 409 | `DUPLICATE_RECORD`, `DUPLICATE_ITEM`, `CUSTOMER_HAS_ORDERS` | Duplicate email, phone or item; customer still has orders |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 KB |
| 500 | `INTERNAL_ERROR` | Unexpected error (details only in server logs) |

## Run locally
Requires Node 20+ and a MongoDB database (a free Atlas cluster works, or a local MongoDB).

1. `git clone https://github.com/mositodrone/printdesk-api.git && cd printdesk-api`
2. `npm install`
3. `cp .env.example .env` and fill in the values below
4. `npm run seed` (loads dummy customers, garment types, staff accounts and orders)
5. `npm run dev`

The API runs at http://localhost:3000

| Variable | Purpose | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string (required) | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/printdesk` |
| `JWT_SECRET` | Secret used to sign tokens, at least 32 characters (required) | generate with `node -p "require('crypto').randomBytes(48).toString('hex')"` |
| `JWT_EXPIRES_IN` | Token lifetime | `1h` |
| `PORT` | Port to listen on | `3000` |
| `NODE_ENV` | `development` or `production` | `development` |

| Script | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start normally |
| `npm run seed` | Wipe and reload dummy data (refuses to run with `NODE_ENV=production` unless `--force` is passed) |

All data is dummy data. No real personal information or real passwords are stored.

## Try the API
Sample requests are in [`requests/`](requests/): `auth.http`, `orders.http`,
`order-items.http` and `customers.http`. Open them in VS Code with the **REST Client**
extension and click "Send Request" above any request. Each request is labelled with the
status code it should return, including failure cases.

Each file starts with named login requests (owner, staff one, staff two). Send the one
for the account you want to act as before anything else; the requests below it use its
token. After reloading VS Code, send the login again. To see ownership checks, create an
order as staff one, then try to edit it as staff two (expect 403).

- **Local:** keep `@baseUrl` as `http://localhost:3000` (run `npm run seed` first).
- **Live:** change `@baseUrl` at the top of the file to the live URL above.

The same requests also work with curl or Postman (Postman can import `docs/api-spec.yaml` directly).

## Docs
In [`/docs`](docs/):
- `idea-one-pager.md`: who it is for, why this idea and stack, key decisions
- `work-plan.md`: what is delivered each week and the top risks
- `erd.png` (source: `erd.dbml`): entity relationship diagram
- `design-decisions.md`: the reasoning behind the data model, auth and API choices
- `api-spec.yaml`: OpenAPI spec for every endpoint
- `feedback-response.md`: Week 1 mentor feedback and what I changed

Reviewer copies: Week 1 documents: https://drive.google.com/drive/folders/1IqhGcwtNn7upJP8d1_SY8q7hoZ0yqswg?usp=sharing |
Week 2 documents: <Week 2 Drive folder link>

## Issue log
Problems found while building, the options I considered and how I fixed them. Entries
1 to 5 were found during Week 1 and are carried over; Week 2 entries follow. The same
entries are tracked as [GitHub Issues](https://github.com/mositodrone/printdesk-api/issues?q=is%3Aissue).

| # | Week | Issue | Cause | Options considered | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | 1 | `/health` and `/` worked but were missing from the spec | Routes were added for operations without updating the contract | Remove them, or document them | Documented both under a System tag and explained them in design decisions | Fixed |
| 2 | 1 | Spec and code disagreed in small details (id case, undocumented 400 and 413 responses) | Validation code and spec were written separately and drifted | Make the code lowercase-only, or widen the spec | Widened the spec id pattern and documented the extra responses | Fixed |
| 3 | 1 | Sample request returned 400 instead of 201 | `createOrder` read a customer id from a `listOrders` response that was empty or stale after seeding. The API was right; the sample file was wrong | Paste ids by hand, file-level variables, or named-request chaining | Kept chaining, re-sent `listOrders` after seeding, added a start-here note | Fixed |
| 4 | 1 | The post-delete 404 check showed no response | It depended on the `createOrder` response from the same editor session | Hard-code a missing id, or keep the chain and move the check | Moved it directly under the delete and labelled the dependency | Fixed |
| 5 | 1 | Exported spec PDF had placeholder contact and license text and clipped examples | The doc generator fills defaults and builds examples from schema types | Regenerate with another tool, accept it, or clean before converting | Removed the boilerplate, corrected example values, enabled wrapping | Fixed |
<!-- Add Week 2 entries below as they happen, with the same columns -->

## Project structure
```
docs/              design documents (one-pager, plan, ERD, spec, decisions, feedback response)
requests/          sample requests (.http)
src/
  server.js        starts the server
  app.js           builds the app: public routes, login-protected routes, error handling
  config.js        environment settings and the database connection
  models.js        the whole data model: Staff, Customer, GarmentType, Order, OrderItem
  auth.js          tokens, authenticate (401), authorize and orderAccess (403)
  validate.js      input checks: request bodies, query parameters and URL ids (400)
  errors.js        AppError, 404 handler and the one error handler (no stack traces)
  seed.js          dummy data loader
  routes/
    auth.js        sign-up and login
    orders.js      orders: rules for what clients may send, plus the handlers
    items.js       order items (mounted under /orders/:id/items)
    customers.js   customers and a customer's orders
    garmentTypes.js  read-only garment catalog
```

To follow a request: `app.js` -> the file in `routes/` -> the checks it lists (`auth.js`, `validate.js`) -> `models.js`.

## Roadmap
- **Week 1:** data model, API spec, CRUD on orders (tag: `week-1`)
- **Week 2:** staff authentication and roles, ownership checks, order items, customers, edge cases (tag: `week-2`)
- **Week 3:** automated tests, API docs, security notes, final deployment
