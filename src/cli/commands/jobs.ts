import { defineCommand } from "citty";
import { createAtScheduler } from "../../scheduler/at.js";

export const jobsCommand = defineCommand({
  meta: { name: "jobs", description: "List scheduled snipe jobs" },
  async run() {
    const sched = createAtScheduler();
    const jobs = await sched.list();
    if (jobs.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No scheduled jobs.");
      return;
    }
    for (const j of jobs) {
      // eslint-disable-next-line no-console
      console.log(`${j.id}  provider=${j.providerId}  runAt=${j.runAt.toISOString()}`);
      // eslint-disable-next-line no-console
      console.log(`  ${j.command}`);
    }
  },
});
