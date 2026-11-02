import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs / nodemailer chỉ chạy phía server (Node runtime)
  serverExternalPackages: ["exceljs", "nodemailer"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
