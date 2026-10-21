import { createHash } from "node:crypto";

type SmtpEnvironment = Record<string, string | undefined>;

export function getSmtpConfig(env: SmtpEnvironment = process.env) {
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT || "587");
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  const from = env.EMAIL_FROM?.trim();
  if (!host || !user || !password || !from) throw new Error("SMTP is nog niet ingesteld. Vul SMTP_HOST, SMTP_USER, SMTP_PASSWORD en EMAIL_FROM in bij Vercel.");
  if (host.includes("://") || /[\s/]/.test(host)) throw new Error("SMTP_HOST moet de servernaam bevatten, zonder protocol of pad.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT moet een geldig poortnummer zijn.");
  const secureSetting = env.SMTP_SECURE?.trim().toLowerCase();
  if (secureSetting && secureSetting !== "true" && secureSetting !== "false") throw new Error("SMTP_SECURE moet true of false zijn.");
  const secure = secureSetting ? secureSetting === "true" : port === 465;
  if (port === 465 && !secure) throw new Error("Gebruik SMTP_SECURE=true voor poort 465.");
  const fromAddress = from.match(/<([^<>]+)>$/)?.[1] || from;
  if (/[\r\n]/.test(from) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromAddress)) throw new Error("EMAIL_FROM moet een geldig afzenderadres bevatten.");
  return { host, port, user, password, from, fromAddress, secure };
}

export function isSmtpConfigured() {
  try {
    getSmtpConfig();
    return true;
  } catch {
    return false;
  }
}

export async function sendSmtpEmail(input: { to: string; subject: string; text: string; html: string; deliveryKey: string }) {
  const config = getSmtpConfig();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.to)) throw new Error("Het e-mailadres van de ontvanger is ongeldig.");
  const domain = config.fromAddress.split("@")[1];
  const messageId = `<${createHash("sha256").update(input.deliveryKey).digest("hex")}@${domain}>`;
  // Checking SMTP configuration while rendering a page must not load the mail transport.
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    dnsTimeout: 10_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      messageId,
    });
    if (!result.accepted?.length || result.rejected?.length) throw new Error("SMTP_RECIPIENT_REJECTED");
    return { emailMessageId: result.messageId || messageId };
  } catch (error) {
    // Provider responses may include credentials or connection details; keep them out of UI and logs.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EAUTH") throw new Error("De SMTP-server weigert de aanmelding. Controleer SMTP_USER en SMTP_PASSWORD.");
    if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS"].includes(code)) throw new Error("De SMTP-server is niet bereikbaar of de beveiligde verbinding mislukt. Controleer server, poort en TLS-instellingen.");
    throw new Error("De SMTP-server heeft de e-mail niet geaccepteerd. Controleer het afzenderadres en de verzendrechten bij de mailprovider.");
  } finally {
    transport.close();
  }
}
