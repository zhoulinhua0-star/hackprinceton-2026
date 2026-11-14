import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// A judge scans this, Messages opens with a pre-filled first message, and they send it: the student texts first.
export default async function Join() {
  const line = process.env.PHOTON_IMESSAGE_LINE ?? "";
  const body = "Hi Syllabus Crew";
  const href = `sms:${line}&body=${encodeURIComponent(body)}`;
  const qr = await QRCode.toDataURL(href, { width: 420, margin: 1, color: { dark: "#1c2230", light: "#fffdf9" } });
  const pretty = line.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3");
  return (
    <main className="demo" style={{ textAlign: "center", maxWidth: 520 }}>
      <h1>Text Syllabus Crew</h1>
      <p>Scan with your iPhone camera. Messages opens with the first text ready; just press send.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt={`QR code to text ${pretty}`} width={320} height={320} style={{ borderRadius: 18, border: "1px solid var(--line)" }} />
      <p style={{ marginTop: 18, fontSize: 20, color: "var(--ink)" }}>{pretty}</p>
      <p style={{ fontSize: 14 }}>iMessage only. It texts you a quiz question and asks before it changes anything.</p>
    </main>
  );
}
