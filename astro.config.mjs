import { defineConfig } from "astro/config";

const isFc2 = process.env.DEPLOY_TARGET === "fc2";

export default defineConfig({
  output: "static",
  site: isFc2 ? "https://ninjaaquarium.web.fc2.com" : "https://naturefigure2014.github.io",
  base: isFc2 ? "/test" : "/naturefigurespagetest"
});
