import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationType = "registered" | "admitted" | "not_eligible";
type Caller = { id: string; role: string; is_active: boolean };
type Application = {
  id: string;
  user_id: string;
  session_id: string;
  status: string;
  score: number | null;
  cutoff_at_decision: number | null;
  remarks: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Notification function is missing Supabase configuration.");
    return json({ error: "Notification service is unavailable" }, 503);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");
  if (!accessToken || accessToken === authorization) {
    return json({ error: "Authentication is required" }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } =
    await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }
  const actorId = authData.user.id;

  let type: NotificationType;
  let applicationId: string;
  try {
    const payload: unknown = await request.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("type" in payload) ||
      !("application_id" in payload) ||
      typeof payload.type !== "string" ||
      !["registered", "admitted", "not_eligible"].includes(payload.type) ||
      typeof payload.application_id !== "string" ||
      !uuidPattern.test(payload.application_id)
    ) {
      await logFailure(service, actorId, null, "invalid_request");
      return json({ error: "Invalid notification request" }, 400);
    }
    type = payload.type as NotificationType;
    applicationId = payload.application_id;
  } catch {
    await logFailure(service, actorId, null, "invalid_request");
    return json({ error: "Invalid notification request" }, 400);
  }

  const { data: callerProfile, error: callerError } = await service
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", actorId)
    .maybeSingle();
  if (callerError || !callerProfile || !callerProfile.is_active) {
    await logFailure(service, actorId, applicationId, "caller_profile_unavailable");
    return json({ error: "Account is not authorized" }, 403);
  }
  const caller = callerProfile as Caller;

  const { data: applicationData, error: applicationError } = await service
    .from("applications")
    .select("id, user_id, session_id, status, score, cutoff_at_decision, remarks")
    .eq("id", applicationId)
    .maybeSingle();
  if (applicationError || !applicationData) {
    await logFailure(service, actorId, applicationId, "application_unavailable");
    return json({ error: "Application was not found" }, 404);
  }
  const application = applicationData as Application;

  if (type === "registered") {
    if (application.user_id !== actorId) {
      await logFailure(service, actorId, applicationId, "registration_owner_mismatch");
      return json({ error: "Not authorized for this application" }, 403);
    }
    if (application.status !== "pending") {
      await logFailure(service, actorId, applicationId, "registration_not_pending");
      return json({ error: "Application is not awaiting review" }, 409);
    }
  } else if (
    !["admissions_officer", "registrar", "super_admin"].includes(caller.role)
  ) {
    await logFailure(service, actorId, applicationId, "staff_required");
    return json({ error: "Staff access is required" }, 403);
  } else if (application.status !== type) {
    await logFailure(service, actorId, applicationId, "decision_status_mismatch");
    return json({ error: "Application decision does not match notification" }, 409);
  }

  const [profileResult, sessionResult, userResult] = await Promise.all([
    service
      .from("profiles")
      .select("full_name")
      .eq("id", application.user_id)
      .single(),
    service
      .from("sessions")
      .select("name, opens_at")
      .eq("id", application.session_id)
      .single(),
    service.auth.admin.getUserById(application.user_id)
  ]);
  if (
    profileResult.error ||
    sessionResult.error ||
    userResult.error ||
    !userResult.data.user?.email
  ) {
    console.error("Unable to read notification recipient details.", {
      profile: profileResult.error?.message,
      session: sessionResult.error?.message,
      user: userResult.error?.message
    });
    await logFailure(service, actorId, applicationId, "recipient_data_unavailable");
    return json({ error: "Unable to prepare the notification" }, 500);
  }

  let admissionNumber: string | null = null;
  let nextSessionDate: string | null = null;
  if (type === "admitted") {
    const { data: student, error } = await service
      .from("students")
      .select("admission_number")
      .eq("application_id", applicationId)
      .maybeSingle();
    if (error || !student) {
      await logFailure(service, actorId, applicationId, "admission_number_unavailable");
      return json({ error: "Admission details are unavailable" }, 500);
    }
    admissionNumber = student.admission_number;
  } else if (type === "not_eligible") {
    const { data: nextSession, error } = await service
      .from("sessions")
      .select("opens_at")
      .gt("opens_at", new Date().toISOString())
      .order("opens_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      await logFailure(service, actorId, applicationId, "next_session_unavailable");
      return json({ error: "Unable to prepare the notification" }, 500);
    }
    nextSessionDate = nextSession?.opens_at ?? null;
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("EMAIL_FROM");
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/+$/, "");
  if (!resendApiKey || !fromAddress || !appUrl) {
    console.error("Notification email configuration is incomplete.");
    await logFailure(service, actorId, applicationId, "email_configuration_missing");
    return json({ error: "Email delivery is unavailable" }, 503);
  }

  const recipientName = profileResult.data.full_name;
  const recipientEmail = userResult.data.user.email;
  const sessionName = sessionResult.data.name;
  const content = renderEmail(
    type,
    recipientName,
    sessionName,
    appUrl,
    application,
    admissionNumber,
    nextSessionDate
  );

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipientEmail],
        subject: content.subject,
        html: content.html
      })
    });
  } catch (error) {
    console.error("Resend request failed.", error);
    await logFailure(service, actorId, applicationId, "resend_request_failed");
    return json({ error: "Email could not be sent" }, 502);
  }

  if (!response.ok) {
    console.error("Resend rejected notification.", { status: response.status });
    await logFailure(service, actorId, applicationId, "resend_delivery_failed");
    return json({ error: "Email could not be sent" }, 502);
  }

  return json({ sent: true }, 200);
});

function renderEmail(
  type: NotificationType,
  name: string,
  sessionName: string,
  appUrl: string,
  application: Application,
  admissionNumber: string | null,
  nextSessionDate: string | null
): { subject: string; html: string } {
  const greeting = `<p style="margin:0 0 20px">Hello ${escapeHtml(name)},</p>`;
  const signature =
    '<p style="margin:24px 0 0">Warm regards,<br><strong>SpringVilla College of Technology</strong></p>';
  const button = `<p style="margin:28px 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Open admissions portal</a></p>`;
  let subject: string;
  let body: string;

  if (type === "registered") {
    subject = "SpringVilla has received your application";
    body = `${greeting}<p style="margin:0 0 16px">Your application for the <strong>${escapeHtml(sessionName)}</strong> session has been received and is now <strong>pending review</strong>.</p><p style="margin:0">We’ll email you when the admissions team has reviewed your application.</p>${button}${signature}`;
  } else if (type === "admitted") {
    subject = "Congratulations — you have been admitted to SpringVilla";
    body = `${greeting}<p style="margin:0 0 16px">Congratulations! You have been admitted for the <strong>${escapeHtml(sessionName)}</strong> session.</p><p style="margin:0">Your admission number is <strong>${escapeHtml(admissionNumber ?? "")}</strong>. Sign in to the portal using your verified email and password to continue to your student dashboard.</p>${button}${signature}`;
  } else {
    const nextDate = nextSessionDate
      ? new Date(nextSessionDate).toLocaleDateString("en", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC"
        })
      : "To be announced";
    body = `${greeting}<p style="margin:0 0 16px">Thank you for applying to SpringVilla. After careful review, we’re sorry to let you know that your application for the <strong>${escapeHtml(sessionName)}</strong> session was not eligible for admission.</p><p style="margin:0 0 8px">Your score: <strong>${application.score ?? "Not recorded"}</strong>.</p><p style="margin:0 0 16px">Cut off at the time of the decision: <strong>${application.cutoff_at_decision ?? "Not recorded"}</strong>.</p><p style="margin:0">The next admission window opens: <strong>${escapeHtml(nextDate)}</strong>. We appreciate your interest and wish you well.</p>${button}${signature}`;
    subject = "Update on your SpringVilla application";
  }

  return {
    subject,
    html: `<div style="margin:0;padding:32px 12px;background:#f0fdf4;font-family:Arial,Helvetica,sans-serif;color:#334155"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dcfce7;border-radius:12px;overflow:hidden"><div style="padding:24px 28px;background:#15803d;color:#fff"><img src="${escapeHtml(appUrl)}/logo.svg" width="48" height="48" alt="SpringVilla College logo" style="display:block;margin-bottom:14px"><div style="font-size:20px;font-weight:700">SpringVilla College of Technology</div><div style="margin-top:4px;font-size:13px;color:#dcfce7">Admissions Portal</div></div><div style="padding:28px;line-height:1.65">${body}</div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">This is an automated message about your SpringVilla application. Please do not reply to this email.</div></div></div>`
  };
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

async function logFailure(
  service: ReturnType<typeof createClient>,
  actorId: string,
  applicationId: string | null,
  reason: string
): Promise<void> {
  const { error } = await service.from("audit_log").insert({
    actor_id: actorId,
    action: "notification_failed",
    entity: "application",
    entity_id: applicationId,
    details: { reason }
  });
  if (error) {
    console.error("Could not write notification failure to audit log.", {
      reason,
      code: error.code
    });
  }
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders });
}
