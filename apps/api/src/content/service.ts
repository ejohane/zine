import { ServiceNames, services } from "./schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export async function getOrCreateService(
  serviceName: ServiceNames,
  db: D1Database,
) {
  // Step 1: Check if the service exists
  const existingService = await drizzle(db)
    .select()
    .from(services)
    .where(eq(services.name, serviceName))
    .then((rows) => rows[0]);

  // Step 2: Return it if found
  if (existingService) {
    return existingService;
  }

  // Step 3: Insert and return the new service
  const newService = await drizzle(db)
    .insert(services)
    .values({
      name: serviceName,
      createdAt: new Date(), // Explicitly set to ensure consistency
    })
    .returning() // Returns all fields
    .then((rows) => rows[0]);

  return newService;
}
