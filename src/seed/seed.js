import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Customer } from "../models/Customer.js";
import { GarmentType } from "../models/GarmentType.js";
import { Order } from "../models/Order.js";

// Wipes and reloads Customers, GarmentTypes and Orders with DUMMY data only.
if (env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusing to seed with NODE_ENV=production. Re-run with --force if you mean it.");
  process.exit(1);
}

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const customers = [
  { name: "Test Customer One", phone: "+2340000000001", email: "customer.one@example.com" },
  { name: "Test Customer Two", phone: "+2340000000002", email: "customer.two@example.com" },
  { name: "Test Customer Three", phone: "+2340000000003" },
  { name: "Test Customer Four", phone: "+2340000000004", email: "customer.four@example.com" },
];

const garmentTypes = [
  { name: "T-shirt", category: "tops", availableSizes: ["S", "M", "L", "XL"], availableColors: ["white", "black", "navy", "red"] },
  { name: "Hoodie", category: "tops", availableSizes: ["S", "M", "L", "XL", "XXL"], availableColors: ["black", "grey", "navy"] },
  { name: "Polo", category: "tops", availableSizes: ["S", "M", "L", "XL"], availableColors: ["white", "black", "green"] },
  { name: "Cap", category: "headwear", availableSizes: ["One size"], availableColors: ["black", "white", "khaki"] },
  { name: "Shorts", category: "bottoms", availableSizes: ["S", "M", "L", "XL"], availableColors: ["black", "grey"] },
  { name: "Tote bag", category: "accessories", availableSizes: ["One size"], availableColors: ["natural", "black"] },
];

async function seed() {
  await connectDB();

  await Promise.all([Order.deleteMany({}), Customer.deleteMany({}), GarmentType.deleteMany({})]);

  const createdCustomers = await Customer.insertMany(customers);
  await GarmentType.insertMany(garmentTypes);

  const [c1, c2, c3, c4] = createdCustomers;
  const createdOrders = await Order.insertMany([
    { customerId: c1._id, status: "received", dueDate: daysFromNow(10), notes: "Matching colours for a group event" },
    { customerId: c1._id, status: "printing", dueDate: daysFromNow(5), notes: "Two sizes, one design" },
    { customerId: c2._id, status: "printing", dueDate: daysFromNow(7) },
    { customerId: c2._id, status: "ready", dueDate: daysFromNow(2), notes: "Customer will collect" },
    { customerId: c3._id, status: "delivered", dueDate: daysFromNow(-3) },
    { customerId: c3._id, status: "received", dueDate: daysFromNow(14), notes: "Bulk order, confirm quantity" },
    { customerId: c4._id, status: "cancelled", notes: "Customer changed their mind" },
    { customerId: c4._id, status: "received", dueDate: daysFromNow(12) },
  ]);

  console.log(
    `Seeded ${createdCustomers.length} customers, ${garmentTypes.length} garment types, ${createdOrders.length} orders.`
  );
  console.log("\nUse these ids in requests/orders.http:");
  console.log(`  customerId: ${createdCustomers[0].id}`);
  console.log(`  orderId:    ${createdOrders[0].id}`);

  await disconnectDB();
}

seed().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
