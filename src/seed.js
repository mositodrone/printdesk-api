import bcrypt from "bcryptjs";
import { env, connectDB, disconnectDB } from "./config.js";
import { Customer, GarmentType, Order, OrderItem, Staff } from "./models.js";

// Wipes and reloads Staff, Customers, GarmentTypes, Orders and OrderItems with DUMMY data only.
// The passwords below are test values for a dummy dataset; never reuse a real password.
if (env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusing to seed with NODE_ENV=production. Re-run with --force if you mean it.");
  process.exit(1);
}

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const staffAccounts = [
  { name: "Test Owner", email: "owner@example.com", password: "owner-password-123", role: "owner" },
  { name: "Test Staff One", email: "staff.one@example.com", password: "staff-password-123", role: "staff" },
  { name: "Test Staff Two", email: "staff.two@example.com", password: "staff-password-123", role: "staff" },
];

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

  await Promise.all([
    OrderItem.deleteMany({}),
    Order.deleteMany({}),
    Customer.deleteMany({}),
    GarmentType.deleteMany({}),
    Staff.deleteMany({}),
  ]);

  // Hash each password before storing it (never store the plain value)
  const staffDocs = await Promise.all(
    staffAccounts.map(async ({ password, ...rest }) => ({
      ...rest,
      passwordHash: await bcrypt.hash(password, 12),
    }))
  );
  const [, staffOne, staffTwo] = await Staff.insertMany(staffDocs);

  const [c1, c2, c3, c4] = await Customer.insertMany(customers);
  const garments = await GarmentType.insertMany(garmentTypes);
  const garmentId = (name) => garments.find((g) => g.name === name)._id;

  // Some orders have a handler and some do not, so the ownership rules can be demonstrated:
  // handled orders can be edited by their handler or an owner; unhandled ones by owners only.
  const orders = await Order.insertMany([
    { customerId: c1._id, handledBy: staffOne._id, status: "received", dueDate: daysFromNow(10), notes: "Matching colours for a group event" },
    { customerId: c1._id, handledBy: staffOne._id, status: "printing", dueDate: daysFromNow(5), notes: "Two sizes, one design" },
    { customerId: c2._id, handledBy: staffTwo._id, status: "printing", dueDate: daysFromNow(7) },
    { customerId: c2._id, handledBy: staffTwo._id, status: "ready", dueDate: daysFromNow(2), notes: "Customer will collect" },
    { customerId: c3._id, status: "delivered", dueDate: daysFromNow(-3) },
    { customerId: c3._id, handledBy: staffOne._id, status: "received", dueDate: daysFromNow(14), notes: "Bulk order, confirm quantity" },
    { customerId: c4._id, status: "cancelled", notes: "Customer changed their mind" },
    { customerId: c4._id, handledBy: staffTwo._id, status: "received", dueDate: daysFromNow(12) },
  ]);

  // Items for some orders (the delivered and cancelled orders are left empty on purpose).
  // Sizes and colours must be ones the garment type offers.
  const [o1, o2, o3, o4, , o6, , o8] = orders;
  const items = await OrderItem.insertMany([
    { orderId: o1._id, garmentTypeId: garmentId("T-shirt"), size: "L", color: "black", quantity: 12, designNote: "Logo on the chest, back plain" },
    { orderId: o1._id, garmentTypeId: garmentId("T-shirt"), size: "M", color: "black", quantity: 8, designNote: "Same logo" },
    { orderId: o2._id, garmentTypeId: garmentId("Hoodie"), size: "L", color: "navy", quantity: 4 },
    { orderId: o2._id, garmentTypeId: garmentId("Hoodie"), size: "XL", color: "navy", quantity: 2 },
    { orderId: o3._id, garmentTypeId: garmentId("Cap"), size: "One size", color: "black", quantity: 20, designNote: "Embroidered front" },
    { orderId: o4._id, garmentTypeId: garmentId("Polo"), size: "M", color: "white", quantity: 10 },
    { orderId: o6._id, garmentTypeId: garmentId("Tote bag"), size: "One size", color: "natural", quantity: 50 },
    { orderId: o8._id, garmentTypeId: garmentId("T-shirt"), size: "S", color: "white", quantity: 6 },
  ]);

  console.log(`Seeded ${staffDocs.length} staff, ${customers.length} customers, ${garmentTypes.length} garment types, ${orders.length} orders, ${items.length} items.`);
  // Passwords are deliberately not printed: the dummy ones are listed in the README
  console.log("\nDummy accounts created (passwords are listed in the README):");
  for (const { email, role } of staffAccounts) console.log(`  ${role.padEnd(5)} ${email}`);

  await disconnectDB();
}

seed().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
