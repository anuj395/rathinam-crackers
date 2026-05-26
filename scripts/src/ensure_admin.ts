import bcrypt from "bcryptjs";

async function main(){
  let dbModule: any;
  try { dbModule = await import("@workspace/db"); } catch (err) { dbModule = await import("../../lib/db/src/index.ts"); }
  const { db, usersTable } = dbModule;
  const passwordHash = await bcrypt.hash("admin123", 10);
  // Upsert admin user
  await db
    .insert(usersTable)
    .values({
      id: "usr-admin",
      name: "Super Admin",
      username: "admin",
      passwordHash,
      pin: "1234",
      role: "SUPER_ADMIN",
      locationIds: [],
      email: "admin@rathinam.com",
      isActive: true,
    })
    .onConflictDoUpdate({
      target: usersTable.username,
      set: { passwordHash, isActive: true, email: "admin@rathinam.com" },
    });
  console.log("Admin upserted/updated");
}

main().catch((e)=>{ console.error(e); process.exit(1); });
