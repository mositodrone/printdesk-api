# PrintDesk

Track: Backend Development   Stack: Node.js, Express, MongoDB (Atlas) with Mongoose, Zod

Target user: The owner or staff of a small custom-print shop (T-shirts, hoodies, caps) who takes orders by chat or walk-in.

Problem: Orders are scattered across chats and notebooks, so garment type, size, colour, quantity and current stage get lost between "received" and "delivered".

Entities: Customer, Staff, Order, OrderItem, GarmentType

Core flow: POST /orders -> PATCH /orders/:id/status -> GET /orders?status=printing

In scope: full CRUD on orders with filtering; status tracking; seeded customers and garment catalog; Staff with roles in the data model (auth in Week 2)

Out of scope: payments; design or image uploads; real-time notifications; a frontend; real customer data

## Why this idea
Adapted from the order-handling side of a print-on-demand product I have worked on, cut down to one user and one problem. No payments or files, so it fits three part-time weeks.

## Why this stack
Node/Express and MongoDB are what I know best (prior MERN experience), so the time goes into API design instead of tooling. Zod handles validation. PostgreSQL would also suit this relational data; I chose familiarity and accept that relationships are enforced in code.

## Key decisions
- OrderItem is a separate collection, so the orders-to-garments many-to-many is explicit
- Staff and roles are in the model from Week 1 so Week 2 auth needs no redesign
- Status is a fixed set, changed through its own endpoint so roles can restrict it later
- Customers and garment types are seeded in Week 1; their endpoints come in Week 2

## Links
Full reasoning: docs/design-decisions.md | ERD: docs/erd.png | Spec: docs/api-spec.yaml | Drive folder: [(https://drive.google.com/drive/folders/1IqhGcwtNn7upJP8d1_SY8q7hoZ0yqswg?usp=sharing)](https://drive.google.com/drive/folders/1IqhGcwtNn7upJP8d1_SY8q7hoZ0yqswg?usp=sharing)

## Top 3 risks
1. Scope creep into payments or uploads
2. Week 2 auth forcing schema changes
3. Deployment issues (Atlas network access, free-host cold starts)
