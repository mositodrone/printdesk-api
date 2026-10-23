import app from "./app.js";
import { env, connectDB } from "./config.js";

async function start() {
  try {
    await connectDB();
    app.listen(env.PORT, () => console.log(`API listening on port ${env.PORT}`));
  } catch (err) {
    console.error("Failed to start:", err.message);
    process.exit(1);
  }
}

start();
