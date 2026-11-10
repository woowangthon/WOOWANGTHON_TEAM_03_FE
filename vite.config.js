import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      proxy: env.DEV_API_TARGET
        ? // Preserve Host and Origin together; Django still validates both and CSRF.
          // The target must allow the development host (127.0.0.1/localhost).
          { "/api": { target: env.DEV_API_TARGET, changeOrigin: false } }
        : undefined,
    },
  };
});
