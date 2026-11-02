import { ANY, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { loadSettings } from "@/lib/settings";
import { capaRows, dueLots, evaluatedStock, historyRows, openPlans } from "@/lib/queries";
import { exportCapa, exportForm, exportHistory, exportPlan, exportReport, exportStock, toBuffer } from "@/lib/excel/export";
import { todayVN } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Export Excel: /api/export/plan | history | stock | form | report | capa */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ kind: string }> }) => {
  await requireRole(ANY);
  const { kind } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const s = await loadSettings();
  const t = todayVN();
  let wb;
  let name = "";
  switch (kind) {
    case "plan": wb = await exportPlan(await openPlans()); name = `Humidity_Plan_${t}`; break;
    case "history": {
      const f = { from: sp.get("from") || undefined, to: sp.get("to") || undefined, brand: sp.get("brand") || undefined, result: sp.get("result") || undefined, q: sp.get("q") || undefined };
      wb = await exportHistory(await historyRows(f)); name = `Inspection_History_${t}`; break;
    }
    case "stock": wb = await exportStock(await evaluatedStock(s)); name = `Stock_Lots_${t}`; break;
    case "form": {
      const d = sp.get("date") || t;
      wb = await exportForm(dueLots(await openPlans(), d, false), s, d); name = `Humidity_Form_${d.replace(/-/g, "")}`; break;
    }
    case "report": {
      const from = sp.get("from") || `${t.slice(0, 4)}-01-01`;
      const to = sp.get("to") || t;
      const rows = (await historyRows({ from, to })).sort((a, b) => a.inspection_date.localeCompare(b.inspection_date));
      wb = await exportReport(rows, s, from, to); name = `Humidity_Report_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}`; break;
    }
    case "capa": wb = await exportCapa(await capaRows(sp.get("status") || undefined)); name = `CAPA_${t}`; break;
    default: return new Response("Unknown export", { status: 404 });
  }
  const buf = await toBuffer(wb);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
});
