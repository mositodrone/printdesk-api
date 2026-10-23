# Design decisions

Revision note: sections 1 to 10 were written in Week 1 (sections 2, 4, 6, 9 and 10 were updated in Week 2). Sections 11 to 21 were added in Week 2 for authentication, authorisation, relationships and error handling.

## 1. MongoDB (Atlas) with Mongoose
I'm using MongoDB because it's the database I already know and Atlas is already set up, so time goes into API design instead of learning new tooling. The data here is fairly relational (customers, orders, items, garment types), so PostgreSQL would be a fair choice too. I'm accepting the tradeoff: relationships and validation are enforced in application code (Mongoose schemas plus Zod) instead of through database constraints.

## 2. References instead of embedding, with OrderItem as its own collection
Order items could be embedded inside each order, which is the typical Mongo pattern. I'm keeping OrderItem as a separate collection that references Order and GarmentType, because:
- it makes the many-to-many relationship between orders and garment types explicit in the ERD
- items can be queried on their own (for example, "how many black hoodies are in printing?")
- every entity gets its own endpoints and id

The cost is extra queries and having to delete an order's items when the order is deleted. Item endpoints were added in Week 2 under `/orders/{id}/items`, and the cascade is described in section 17.

## 3. Staff entity exists from Week 1
Authentication wasn't built until Week 2, but Staff (with a `role` of `owner` or `staff` and a `passwordHash` field) was in the data model from the start so adding auth didn't force a schema redesign. `Order.handledBy` was optional until then. Passwords are only ever stored hashed (section 13).

## 4. Required fields
- **Customer:** `name` and `phone` are required because the shop needs a way to reach the person about an order; `email` is optional. `phone` must be unique and 7 to 20 characters (digits with an optional leading +, spaces, brackets and dashes).
- **Order:** `customerId` is required (an order without a customer is meaningless); `status` is required and starts as `received`; `dueDate` (must be today or later when an order is created) and `notes` (max 500 characters) are optional.
- **OrderItem:** `orderId`, `garmentTypeId`, `size`, `color` and `quantity` are required because an item can't be produced without them; `quantity` must be a whole number from 1 to 1000; `designNote` is optional plain text (max 300 characters). `size` and `color` must be offered by the chosen garment type.
- **GarmentType:** `name` is required; sizes and colours are lists of allowed values.
- **Staff:** `name`, `email` (unique) and `password` (8 to 72 characters) are required at sign-up.

## 5. Order status is a fixed set, changed through its own endpoint
`status` is one of `received`, `printing`, `ready`, `delivered`, `cancelled`. A fixed set keeps filtering (`GET /orders?status=printing`) reliable and lets the API return 400 for any other value instead of storing typos. Status is changed through `PATCH /orders/{id}/status` and cannot be changed through `PATCH /orders/{id}`, so status changes can be permitted without permitting other edits (section 16).

## 6. Garment types stay seeded and read-only; customers got endpoints in Week 2
Week 1 only required CRUD on the main entity (Order), so customers and garment types were seeded. In Week 2 customers gained endpoints (create, get one, list their orders, delete). Garment types stay seeded, with a single read-only endpoint, `GET /garment-types`: clients need the ids, and the sizes and colours each garment offers, to add order items. They can't be created, changed or deleted through the API because the catalog changes rarely.

## 7. Scope limits
No payments, no file or image uploads (`designNote` is plain text only), no real-time features, and dummy data only. This keeps the project buildable in three weeks and avoids storing real personal data.

## 8. Naming conventions and IDs
REST paths use plural nouns (`/orders`, `/customers`). JSON fields use camelCase (`customerId`, `dueDate`). The ERD diagram uses snake_case because that's the dbdiagram.io convention; the API and Mongoose models use camelCase. MongoDB stores ids as `_id`, but the API exposes them as `id` (a Mongoose `toJSON` transform handles this) so clients never see database-specific names.

## 9. Errors and status codes
Every error uses one JSON shape (`error.code`, `error.message`, optional `error.details`) and never includes a stack trace. A malformed id returns 400, not 404 or 500. A well-formed id that doesn't exist returns 404. A reference to a record that doesn't exist inside a request body (for example `customerId` or `garmentTypeId`) returns 400. Delete returns 200 with the deleted id, following the brief's "200 on success". Unknown fields in a request body are rejected with 400 instead of being ignored, and request bodies over 10 KB are rejected with 413. Week 2 added 401, 403 and 409 responses; the full list of error codes is in the API description in the spec.

## 10. Health check and root endpoints
`GET /health` returns `{ "status": "ok" }` without touching the database. It exists for two operational reasons: free hosting tiers put the server to sleep when idle, so I can wake it before a demo or review, and a host can use it to confirm the app started. It is documented in the spec like every other endpoint and needs no login, since it exposes no data. `GET /` returns a small JSON index (API name, status and endpoint paths) so the base URL shows something useful when opened in a browser. It is also in the spec.

## 11. "Users" in this project are Staff
The Week 2 brief talks about users and an admin role. In this API the authenticated user is a Staff member, and the admin role is `owner`. Customers are not users: they never log in, they are records the shop keeps.

## 12. JWT authentication
Login returns a signed JSON Web Token (HS256) carrying the staff id and role, valid for 1 hour, sent as `Authorization: Bearer <token>`. I chose tokens over server-side sessions because they need no session store, which suits a free host that restarts and sleeps. The signing secret is an environment variable (at least 32 characters), never in the repository.

The tradeoff is that a token can't be revoked before it expires and there is no logout or refresh token. To limit the damage, the server loads the staff account from the database on every request, so a deleted account is rejected immediately and a role change applies immediately.

## 13. Password handling
Passwords are hashed with bcrypt (the `bcryptjs` package, cost factor 12) before they are stored. Passwords must be 8 to 72 characters, because bcrypt only reads the first 72 bytes. The hash is excluded from queries by default (`select: false`) and removed from every response. Passwords and request bodies are never logged. Login returns the same 401 message whether the email or the password was wrong, so the API doesn't reveal which emails are registered.

## 14. Sign-up and roles
Sign-up is open but always creates a `staff` account. A `role` field in the body is rejected with 400, so nobody can grant themselves owner rights. Owners are created by the seed script and, in a real deployment, by the administrator directly in the database. The tradeoff is that anyone can create a staff account on this API; a real shop would add an invite code or approval step, which is outside this project's scope.

## 15. Which routes need a login
Everything except `GET /`, `GET /health`, `POST /auth/signup` and `POST /auth/login`. This is stricter than the brief's minimum (only creating or changing data), because orders and customers contain contact details, even though the data here is dummy data. Week 1 sample requests therefore now need a token.

## 16. Authorisation and ownership
Roles are `owner` and `staff`. The rules:
- Any logged-in staff member can read orders, items, customers and garment types, create orders and customers, and change an order's status. Status is open to everyone because in a shop one shift often moves along another person's order.
- Editing or deleting an order, or adding or removing its items, is allowed only for an owner or for the staff member in the order's `handledBy` field. `handledBy` is set automatically from the token when an order is created, so it can't be faked. Seeded orders with no handler can be changed by owners only.
- Deleting a customer is owner-only. Customers are shared records, so they have no single owner.

401 means the API doesn't know who you are (no token, or an invalid or expired one). 403 means it does, and you aren't allowed. When an order doesn't exist the answer is 404 before any permission check; this reveals which order ids exist, which I accept because every logged-in staff member can already read all orders.

## 17. Relationships and related-data endpoints
- Items live under their order: `GET` and `POST /orders/{id}/items`, `DELETE /orders/{id}/items/{itemId}`. The URL states the relationship, and an item that belongs to a different order than the one in the path is reported as not found.
- `GET /customers/{id}/orders` returns one customer's orders with the same shape and pagination as the main orders list.
- When an item is added, the garment type must exist, and the size and colour must be ones that garment type offers. This uses the catalog data already in the database to protect integrity.
- **Deleting an order deletes its items.** Items have no meaning without their order, so leaving them behind would create orphaned records. The items are removed first and then the order. This is not atomic (a database transaction would make it so); if the second step fails, the order is left without items, which is safer than orphaned items. I decided a transaction wasn't worth the added complexity for this project.
- **Deleting a customer who has orders is refused with 409** (`CUSTOMER_HAS_ORDERS`). Orders are business records, and silently deleting them along with a customer could destroy order history. The check and the delete are two separate steps, so an order created in the instant between them could be left without its customer; a transaction would close that gap, and I judged it out of scope. The owner-only role check runs first, so a non-owner gets 403 whether or not the customer exists.
- Garment types can't be created, changed or deleted through the API. The only endpoint is the read-only `GET /garment-types`, which clients use to find the ids they need when adding items.

## 18. Duplicates
Unique values (staff email, customer phone) are enforced by unique indexes in MongoDB, and the duplicate key error is translated to a 409 `DUPLICATE_RECORD`. Letting the database enforce it avoids a race where two simultaneous requests both pass a check. Phone uniqueness compares the exact text entered, so the same number written with different spacing counts as a different number; normalising phone numbers is out of scope. A duplicate item on an order (same garment, size and colour) returns 409 `DUPLICATE_ITEM` and tells the client to change the quantity instead. That one is checked in code, so two identical requests sent at the same instant could both pass; a unique compound index would close that gap, and I judged the risk acceptable at this scale.

## 19. Validation
Every request body, query parameter and path id is validated with Zod before the route's handler runs. Unknown fields are rejected. References to other records are checked to exist (customer, garment type, order). Validation errors list each problem field in `details`.

## 20. Error handling additions
Token problems become 401 inside the authentication middleware, so an expired or invalid token can never turn into a 500. MongoDB duplicate key errors become 409. Anything unexpected returns a generic 500 and the real error is logged on the server only.

## 21. Known limitations
Not done, and deliberately left for later or out of scope: phone number normalisation, an atomic customer delete, rate limiting on login, token revocation or refresh tokens, database transactions for the cascade delete, automated tests (Week 3), and an invite or approval step for sign-up.

## 22. Project structure
Each resource (auth, orders, items, customers, garment types) lives in one file under `src/routes/`, holding its Zod rules and its handlers together, so a request can be followed in one place. Cross-cutting concerns each get one small file: `auth.js` (tokens and permission checks), `validate.js` (input checks), `errors.js` (the single error handler), and `models.js` holds the whole data model next to each other, mirroring the ERD. For an API this size, separate controller, validator and route layers would have meant four or five files per resource without adding any safety. Security does not depend on the file layout: every check still runs in the same order, shown in the middleware lists in each route file.
