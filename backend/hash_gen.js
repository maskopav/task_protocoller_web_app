// backend/hash_gen.js
import bcrypt from "bcrypt";

// Pass the password as an argument rather than editing it into this tracked file.
const password = process.argv[2];
if (!password) {
  console.error("Usage: node backend/hash_gen.js '<password>'");
  process.exit(1);
}
const hash = await bcrypt.hash(password, 10);

console.log("\n--- COPY THE HASH BELOW ---");
console.log(hash);
console.log("---------------------------\n");

// Run using node backend/hash_gen.js '<password>'

// USAGE FOR GENERATING MASTER USER
// If you want to run runInit.js, then copy paste generated hash to artificial_data.sql 
// OR
// Insert manually into DB:
/*
INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password)
VALUES (
    'your_email@example.com', 
    '<PASTE_HASH_HERE>', 
    '<Master name>', 
    1, 
    1,
    1
);
*/

