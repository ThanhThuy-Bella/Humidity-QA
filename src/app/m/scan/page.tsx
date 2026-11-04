import QrScanner from "@/components/QrScanner";

export default function ScanPage() {
  return (
    <>
      <h1 className="text-lg font-bold text-teal-dark mb-2">Quét mã QR của lô cần đo</h1>
      <QrScanner />
    </>
  );
}
