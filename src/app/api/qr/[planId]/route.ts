import QRCode from "qrcode";

export const runtime = "nodejs";

/** QR của lô → mở /m/lot/<PlanID> trên điện thoại QA (chỉ chứa đường link, không chứa dữ liệu) */
export async function GET(req: Request, ctx: { params: Promise<{ planId: string }> }) {
  const { planId } = await ctx.params;
  if (!/^[A-Z0-9-]{3,40}$/i.test(planId)) return new Response("Bad id", { status: 400 });
  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const svg = await QRCode.toString(`${base}/m/lot/${encodeURIComponent(planId)}`, {
    type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" },
  });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
