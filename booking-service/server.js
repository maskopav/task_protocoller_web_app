// server.js — standalone process entry point. See src/app.js for the
// notes on running this mounted inside another process instead.
import "dotenv/config";
import { createBookingApp } from "./src/app.js";

const app = createBookingApp();

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`✅ booking-service running on http://localhost:${PORT}`);
});
