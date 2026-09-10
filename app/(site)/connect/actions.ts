"use server";

import { createPublicClient } from "@/lib/supabase/public";
import { supabaseConfigured } from "@/lib/supabase/config";

export interface ConnectState {
  status: "idle" | "success" | "error";
  message?: string;
}

/**
 * The Connect form.
 *
 * The one rule here: this action only reports success after the row is
 * actually in the database. It used to return success in "demo mode" (no
 * Supabase configured) — which in a production deployment missing its
 * environment variables meant every visitor was told their message had been
 * sent, and none of them had.
 */
export async function sendMessage(
  _prev: ConnectState,
  formData: FormData
): Promise<ConnectState> {
  // honeypot — bots fill every field
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { status: "success" };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);

  if (!name || !email || !body) {
    return { status: "error", message: "All three fields matter — mind filling them in?" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "That email looks a little off." };
  }

  if (!supabaseConfigured) {
    if (process.env.NODE_ENV === "production") {
      console.error("[connect] refused: Supabase is not configured in this deployment.");
      return {
        status: "error",
        message: "The contact form is temporarily unavailable. Please email me instead.",
      };
    }
    // Development only, and it says so on screen.
    console.info("[connect] not stored — no Supabase configured (development):", { name, email });
    return {
      status: "error",
      message: "Development mode: no database configured, so this message was not stored.",
    };
  }

  const sb = createPublicClient();
  const { error } = await sb.from("messages").insert({ name, email, body });
  if (error) {
    console.error("[connect] insert failed:", error.message);
    // The database rate-limit trigger raises this class of error.
    if (error.code === "53400") {
      return {
        status: "error",
        message: "That's a few messages in a short while — try again in an hour?",
      };
    }
    return { status: "error", message: "Couldn't save your message. Try again in a moment?" };
  }
  return { status: "success" };
}
