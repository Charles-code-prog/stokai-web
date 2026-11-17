import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cliente do Turso fica fora do bundle (tem partes nativas para arquivos locais).
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
