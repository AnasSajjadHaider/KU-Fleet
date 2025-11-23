import cron from "node-cron";
import { generateDailyAnalytics } from "./analytics.service";

cron.schedule("0 0 * * *", async () => {
  console.log("Running daily analytics...");
  await generateDailyAnalytics();
});
