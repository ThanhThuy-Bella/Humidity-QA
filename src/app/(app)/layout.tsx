import Sidebar from "@/components/Sidebar";
import { displayName, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="md:flex min-h-screen">
      <Sidebar userName={displayName(me)} role={me.role} />
      <main className="flex-1 min-w-0 px-4 md:px-8 py-6 print-area">{children}</main>
    </div>
  );
}
