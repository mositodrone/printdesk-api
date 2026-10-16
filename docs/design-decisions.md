# Design decisions

## 1. MongoDB (Atlas) with Mongoose
I'm using MongoDB because it's the database I already know and Atlas is already set up, so Week 1 time goes into API design instead of learning new tooling. The data here is fairly relational (customers, orders, items, garment types), so PostgreSQL would be a fair choice too. I'm accepting the tradeoff: relationships and validation are enforced in application code (Mongoose schemas plus Zod) instead of through database constraints.

## 2. References instead of embedding, with OrderItem as its own collection
Order items could be embedded inside each order, which is the typical Mongo pattern. I'm keeping OrderItem as a separate collection that references Order and GarmentType, because:
- it makes the many-to-many relationship between orders and garment types explicit in the ERD
- items can be queried on their own (for example, "how many black hoodies are in printing?")
- every entity gets its own endpoints and id

The cost is extra queries and having to delete an order's items when the order is deleted. OrderItem endpoints arrive in Week 2, and the delete behaviour will be handled then.

## 3. Staff entity exists from Week 1
Authentication isn't built until Week 2, but Staff (with a `role` of `owner` or `staff` and a `passwordHash` field) is in the data model now so adding auth doesn't force a schema redesign. `Order.handledBy` is optional until then. Passwords will only ever be stored hashed.

## 4. Required fields
- **Customer:** `name` and `phone` are required because the shop needs a way to reach the person about an order; `email` is optional.
- **Order:** `customerId` is required (an order without a customer is meaningless); `status` is required and starts as `received`; `dueDate` (must be today or later when an order is created) and `notes` (max 500 characters) are optional.
- **OrderItem:** `orderId`, `garmentTypeId`, `size`, `color` and `quantity` are required because an item can't be produced without them; `quantity` must be a positive integer; `designNote` is optional free text.
- **GarmentType:** `name` is required; sizes and colours are lists of allowed values.

## 5. Order status is a fixed set, changed through its own endpoint
`status` is one of `received`, `printing`, `ready`, `delivered`, `cancelled`. A fixed set keeps filtering (`GET /orders?status=printing`) reliable and lets the API return 400 for any other value instead of storing typos. Status is changed through `PATCH /orders/{id}/status` and cannot be changed through `PATCH /orders/{id}`, so that once roles exist, staff can be allowed to move orders along without being allowed to edit other order details.

## 6. Customers and garment types are seeded in Week 1
Week 1 requires full CRUD on the main entity only, which is Order. Customers and garment types are loaded by the seed script and have no endpoints yet. Customer endpoints arrive in Week 2 with the relationship work, and the garment catalog changes rarely enough that it can stay seeded.

## 7. Scope limits
No payments, no file or image uploads (`designNote` is plain text only), no real-time features, and dummy data only. This keeps the project buildable in three weeks and avoids storing real personal data.

## 8. Naming conventions and IDs
REST paths use plural nouns (`/orders`, `/customers`). JSON fields use camelCase (`customerId`, `dueDate`). The ERD diagram uses snake_case because that's the dbdiagram.io convention; the API and Mongoose models use camelCase. MongoDB stores ids as `_id`, but the API exposes them as `id` (a Mongoose `toJSON` transform handles this) so clients never see database-specific names.

## 9. Errors and status codes
Every error uses one JSON shape (`error.code`, `error.message`, optional `error.details`) and never includes a stack trace. A malformed id returns 400, not 404 or 500. A well-formed id that doesn't exist returns 404. A `customerId` that is well-formed but matches no customer on order creation returns 400. Delete returns 200 with the deleted id, following the brief's "200 on success". Unknown fields in a request body are rejected with 400 instead of being ignored, and request bodies over 10 KB are rejected with 413.

## 10. Health check and root endpoints
`GET /health` returns `{ "status": "ok" }` without touching the database. It exists for two operational reasons: free hosting tiers put the server to sleep when idle, so I can wake it before a demo or review, and a host can use it to confirm the app started. It is documented in the spec like every other endpoint and has no authentication, since it exposes no data.
`GET /` returns a small JSON index (API name, status and endpoint paths) so the base URL shows something useful when opened in a browser. It is also in the spec.
