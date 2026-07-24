/**
 * send-recovery-auth
 * Delivers an account recovery OTP via BOTH SMS (ITouch VAS) AND Email (Supabase SMTP).
 *
 * Expects body: { email?: string, phone?: string, code: string, origin?: string }
 *
 * Flow:
 * 1. Look up the worker by email or phone.
 * 2. Fire SMS (ITouch VAS) + Email (Supabase SMTP) in parallel.
 * 3. Succeed as long as at least one channel delivered.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

import nodemailer from "https://esm.sh/nodemailer@6.9.10";

// ── Email via Gmail SMTP (send magic-link style email) ─────────────────────
async function sendEmailOtp(
  workerEmail: string,
  workerName: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const firstName = (workerName || "User").split(" ")[0];
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = Deno.env.get("SMTP_USER") || "gkadi97@gmail.com";
    const smtpPass = Deno.env.get("SMTP_PASS") || "tyeyywmylrmyleea";

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f4f6fa;border-radius:16px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:24px;font-weight:900;color:#00d4aa;letter-spacing:-0.5px;">Adequate Capital</div>
          <div style="font-size:13px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:2px;">Account Recovery</div>
        </div>
        <p style="color:#333;font-size:15px;margin-bottom:8px;">Dear <strong>${firstName}</strong>,</p>
        <p style="color:#555;font-size:14px;margin-bottom:24px;">
          We received a request to recover access to your Adequate Capital account. Use the code below to proceed:
        </p>
        <div style="background:#0d1421;border-radius:16px;padding:32px 24px;text-align:center;margin:0 0 24px;">
          <div style="font-size:48px;font-weight:900;letter-spacing:16px;color:#00d4aa;font-family:'Courier New',monospace;">${code}</div>
          <div style="color:#666;font-size:12px;margin-top:12px;text-transform:uppercase;letter-spacing:1px;">expires in 2 minutes</div>
        </div>
        <p style="color:#888;font-size:13px;line-height:1.6;">
          ⚠️ Do <strong>not</strong> share this code with anyone. Adequate Capital staff will never ask for your recovery code.
        </p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
        <p style="color:#bbb;font-size:11px;text-align:center;">
          If you did not request this, your account is safe — simply ignore this email.<br>
          Adequate Capital Ltd &nbsp;·&nbsp; Secure Portal
        </p>
      </div>`;

    await transporter.sendMail({
      from: `"Adequate Capital" <${smtpUser}>`,
      to: workerEmail,
      subject: `🔐 Your Recovery Code: ${code}`,
      html: htmlBody,
      text: `Dear ${firstName}, your Adequate Capital recovery code is: ${code}. It expires in 2 minutes. Do not share it.`,
    });

    console.log(`[Recovery] Email SMTP dispatch succeeded for ${workerEmail}`);
    return { ok: true };

  } catch (e: any) {
    console.error("[Recovery] SMTP Email error:", e.message);
    return { ok: false, error: e.message };
  }
}

// ── SMS via ITouch VAS ────────────────────────────────────────────────────────
async function sendSmsOtp(
  supabase: ReturnType<typeof createClient>,
  targetPhone: string,
  workerName: string,
  code: string,
  origin?: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey   = Deno.env.get("INTOUCH_API_KEY") ?? "";
  const senderId = Deno.env.get("INTOUCH_SENDER_ID") ?? "Adequate";

  if (!apiKey) return { ok: false, error: "SMS service not configured" };

  // Format to Kenyan E.164
  let phone = targetPhone.replace(/[\s\-()]/g, "").replace(/^\+/, "").replace(/^0/, "254");
  if (phone.length === 9) phone = "254" + phone;

  const firstName = (workerName || "Admin").split(" ")[0];
  let msg = `Dear ${firstName}, your Adequate Capital recovery code is: ${code}. Expires in 2 minutes. Do not share it.`;

  if (origin) {
    try {
      const domain = new URL(origin).hostname;
      msg += `\n\n@${domain} #${code}`;
    } catch (_) { /* ignore */ }
  }

  try {
    const smsRes = await fetch("https://sms-service.intouchvas.io/message/send/transactional", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ message: msg, msisdn: phone, sender_id: senderId }),
    });

    const smsJson = await smsRes.json().catch(() => ({}));
    console.log(`[Recovery] SMS to ${phone}: status=${smsRes.status}`, JSON.stringify(smsJson));

    // Log (best effort, non-blocking)
    supabase.from("sms_logs").insert({
      phone, message: msg, status_code: smsRes.status,
      response_body: smsJson, sender_id: senderId,
      customer_id: null, source: "send-recovery-auth",
    }).then(() => {}).catch(() => {});

    const isOk = smsRes.ok || (typeof smsJson?.message === "string" && smsJson.message.toLowerCase().includes("success"));
    return isOk ? { ok: true } : { ok: false, error: `SMS gateway error (${smsRes.status})` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const { email, phone: inputPhone, code, origin } = await req.json();

    if (!(email || inputPhone) || !code) {
      return json({ error: "email/phone and code are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Resolve worker ──────────────────────────────────────────────────────
    let worker: any = null;

    if (email) {
      const { data } = await supabase
        .from("workers")
        .select("id, name, phone, mfa_phone, role, email, avatar")
        .eq("email", email.trim())
        .maybeSingle();
      worker = data;
    } else if (inputPhone) {
      // Use last 9 digits to match Kenyan numbers regardless of prefix
      const cleanPhone = inputPhone.replace(/\D/g, "").slice(-9);
      // Search mfa_phone first (priority), then phone
      // Use .limit(1) not .maybeSingle() to avoid PGRST116 when multiple rows match
      const { data: byMfa } = await supabase
        .from("workers")
        .select("id, name, phone, mfa_phone, role, email, avatar")
        .ilike("mfa_phone", `%${cleanPhone}`)
        .limit(1);
      if (byMfa && byMfa.length > 0) {
        worker = byMfa[0];
      } else {
        const { data: byPhone } = await supabase
          .from("workers")
          .select("id, name, phone, mfa_phone, role, email, avatar")
          .ilike("phone", `%${cleanPhone}`)
          .limit(1);
        worker = byPhone?.[0] ?? null;
      }
    }

    if (!worker) {
      console.warn(`[Recovery] No worker found for ${email || inputPhone}`);
      return json({ success: true, message: "If a matching account exists, a code was sent." });
    }

    const ALLOWED_ROLES = ["admin", "super admin", "director", "superadmin",
      "loan officer", "collections officer", "finance", "asset recovery", "worker"];
    if (worker.role && !ALLOWED_ROLES.some((r: string) => worker.role.toLowerCase().includes(r))) {
      return json({ success: true, message: "If a matching account exists, a code was sent." });
    }

    const targetPhone = worker.mfa_phone || worker.phone;
    const targetEmail = worker.email;

    // ── Fire SMS + Email simultaneously ─────────────────────────────────────
    const [smsResult, emailResult] = await Promise.all([
      targetPhone
        ? sendSmsOtp(supabase, targetPhone, worker.name, code, origin)
        : Promise.resolve({ ok: false, error: "No phone on profile" }),
      targetEmail
        ? sendEmailOtp(targetEmail, worker.name, code)
        : Promise.resolve({ ok: false, error: "No email on profile" }),
    ]);

    console.log("[Recovery] SMS result:", smsResult, "| Email result:", emailResult);

    const anyOk = smsResult.ok || emailResult.ok;
    if (!anyOk) {
      return json({
        success: false,
        error: `Could not deliver code. SMS: ${smsResult.error}. Email: ${emailResult.error}.`,
      });
    }

    const channels: string[] = [];
    if (smsResult.ok && targetPhone)   channels.push(`SMS (…${String(targetPhone).slice(-4)})`);
    if (emailResult.ok && targetEmail) channels.push(`Email (${targetEmail.replace(/(.{2}).+(@.+)/, "$1***$2")})`);

    return json({
      success: true,
      message: `Code sent via ${channels.join(" and ")}.`,
      channels,
      worker: {
        name:   worker.name,
        role:   worker.role,
        email:  worker.email,
        avatar: worker.avatar,
      },
    });

  } catch (err: any) {
    console.error("[Recovery] Fatal:", err.message);
    return json({ success: false, error: `Internal error: ${err.message}` });
  }
});
