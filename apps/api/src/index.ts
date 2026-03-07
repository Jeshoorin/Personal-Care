import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = await createApp();
app.listen(env.API_PORT, () => {
  console.log(`API listening on ${env.API_BASE_URL}`);
});
