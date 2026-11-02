// Creates the first administrator account. Public sign-up is disabled, so the
// very first admin has to be created with the secret key; after that, admins
// add users from the Users page.
//
// Usage (reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local):
//   node --env-file=.env.local scripts/create-first-admin.mjs "Full Name" email@example.com
// You'll be prompted for a password (at least 12 characters).

import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const [fullName, email] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!fullName || !email) {
  console.error('Usage: node --env-file=.env.local scripts/create-first-admin.mjs "Full Name" email@example.com');
  process.exit(1);
}
if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Password for the new admin (min 12 characters): ");
rl.close();
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "admin" },
  user_metadata: { full_name: fullName },
});

if (error) {
  console.error(`Could not create the admin: ${error.message}`);
  process.exit(1);
}
console.log(`Admin created: ${data.user.email}. Sign in at /login.`);
