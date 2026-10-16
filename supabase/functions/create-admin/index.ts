import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminRole = "admissions_officer" | "registrar" | "super_admin";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

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
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/+$/, "");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    console.error("Admin invitation function is missing Supabase configuration.");
    return json({ error: "Admin management is unavailable" }, 503);
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

  const { data: caller, error: callerError } = await service
    .from("profiles")
    .select("role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (
    callerError ||
    caller?.role !== "super_admin" ||
    caller.is_active !== true
  ) {
    return json({ error: "Only an active super admin can invite administrators" }, 403);
  }

  let email: string;
  let role: AdminRole;
  try {
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("email" in body) ||
      !("role" in body) ||
      typeof body.email !== "string" ||
      typeof body.role !== "string"
    ) {
      return json({ error: "Provide a valid email and administrator role" }, 400);
    }
    email = body.email.trim().toLowerCase();
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["admissions_officer", "registrar", "super_admin"].includes(body.role)
    ) {
      return json({ error: "Provide a valid email and administrator role" }, 400);
    }
    role = body.role as AdminRole;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { data: invitation, error: inviteError } =
    await service.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: email.split("@")[0],
        springvilla_admin_role: role
      },
      redirectTo: `${appUrl}/`
    });
  if (inviteError || !invitation.user) {
    console.error("Could not invite administrator.", {
      code: inviteError?.code,
      status: inviteError?.status
    });
    return json(
      {
        error:
          inviteError?.code === "email_exists"
            ? "An account already exists for this email. Use another address or contact a super admin."
            : "The administrator invitation could not be sent"
      },
      inviteError?.code === "email_exists" ? 409 : 502
    );
  }

  const { error: roleError } = await service
    .from("profiles")
    .update({ role, is_active: true })
    .eq("id", invitation.user.id);
  if (roleError) {
    console.error("Invited account profile role could not be assigned.", {
      code: roleError.code
    });
    await service.from("audit_log").insert({
      actor_id: authData.user.id,
      action: "admin_invitation_role_assignment_failed",
      entity: "profile",
      entity_id: invitation.user.id,
      details: { requested_role: role }
    });
    return json(
      {
        error:
          "The invite was created, but its role could not be assigned. Contact a super admin before the invite is accepted."
      },
      500
    );
  }

  const { error: auditError } = await service.from("audit_log").insert({
    actor_id: authData.user.id,
    action: "admin_invited",
    entity: "profile",
    entity_id: invitation.user.id,
    details: { role }
  });
  if (auditError) {
    console.error("Administrator invitation audit entry could not be written.", {
      code: auditError.code
    });
  }

  return json({ invited: true, user_id: invitation.user.id, role }, 200);
});

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders });
}
