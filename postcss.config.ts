import type { PostCSSOptions } from "@rsbuild/core";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import tailwindConfig from "./tailwind.config";

export default {
  plugins: [tailwindcss(tailwindConfig), autoprefixer()],
} satisfies PostCSSOptions;