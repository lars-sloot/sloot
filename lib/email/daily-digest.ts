type DailyDigest = {
  organizationName: string;
  dateLabel: string;
  incoming: number;
  processed: number;
  approved: number;
  rejected: number;
  pending: number;
  pendingUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function dailyDigestEmail(data: DailyDigest) {
  const organizationName = escapeHtml(data.organizationName);
  const dateLabel = escapeHtml(data.dateLabel);
  const pendingUrl = escapeHtml(data.pendingUrl);
  const subject = `Dagoverzicht pakbonnen – ${data.dateLabel}`;
  const text = [
    `${data.organizationName} – Dagoverzicht pakbonnen voor ${data.dateLabel}`,
    "",
    `Binnengekomen: ${data.incoming}`,
    `Verwerkt: ${data.processed}`,
    `Geaccordeerd: ${data.approved}`,
    `Afgewezen: ${data.rejected}`,
    `Nog te controleren: ${data.pending}`,
    "",
    `Open de openstaande pakbonnen: ${data.pendingUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="nl">
  <body style="margin:0;background:#f5f7f4;font-family:Arial,sans-serif;color:#18221b">
    <div style="max-width:620px;margin:0 auto;padding:32px 16px">
      <div style="background:#173b2b;border-radius:18px 18px 0 0;padding:24px;color:#fff">
        <div style="font-size:13px;opacity:.75">${organizationName}</div>
        <h1 style="margin:8px 0 0;font-size:25px;line-height:1.25">Dagoverzicht pakbonnen</h1>
        <div style="margin-top:8px;font-size:14px;opacity:.8">${dateLabel}</div>
      </div>
      <div style="background:#fff;border:1px solid #dce4dd;border-top:0;border-radius:0 0 18px 18px;padding:24px">
        <table role="presentation" style="width:100%;border-collapse:collapse">
          <tr><td style="padding:11px 0;border-bottom:1px solid #edf0ed;color:#667168">Binnengekomen</td><td style="padding:11px 0;border-bottom:1px solid #edf0ed;text-align:right;font-weight:700;font-size:20px">${data.incoming}</td></tr>
          <tr><td style="padding:11px 0;border-bottom:1px solid #edf0ed;color:#667168">Verwerkt</td><td style="padding:11px 0;border-bottom:1px solid #edf0ed;text-align:right;font-weight:700;font-size:20px">${data.processed}</td></tr>
          <tr><td style="padding:11px 0;border-bottom:1px solid #edf0ed;color:#667168">Geaccordeerd</td><td style="padding:11px 0;border-bottom:1px solid #edf0ed;text-align:right;font-weight:700">${data.approved}</td></tr>
          <tr><td style="padding:11px 0;border-bottom:1px solid #edf0ed;color:#667168">Afgewezen</td><td style="padding:11px 0;border-bottom:1px solid #edf0ed;text-align:right;font-weight:700">${data.rejected}</td></tr>
          <tr><td style="padding:11px 0;color:#667168">Nog te controleren</td><td style="padding:11px 0;text-align:right;font-weight:700;font-size:20px;color:#9a6500">${data.pending}</td></tr>
        </table>
        <a href="${pendingUrl}" style="display:inline-block;margin-top:24px;background:#173b2b;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:12px">Open te controleren pakbonnen</a>
        <p style="margin:24px 0 0;color:#819087;font-size:12px;line-height:1.5">Dit is een automatisch dagelijks overzicht van Sloot pakbonnen.</p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
