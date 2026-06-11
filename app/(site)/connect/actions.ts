"use server";

import { createPublicClient } from "@/lib/supabase/public";
import { supabaseConfigured } from "@/lib/supabase/config";

export interface ConnectState {
  status: "idle" | "success" | "error";
  message?: string;
}

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
    // demo mode without Supabase — pretend success so the flow is testable
    console.info("[connect] message received (demo mode):", { name, email });
    return { status: "success" };
  }

  const sb = createPublicClient();
  const { error } = await sb.from("messages").insert({ name, email, body });
  if (error) {
    console.error("[connect] insert failed:", error.message);
    return { status: "error", message: "Couldn't save your message. Try again in a moment?" };
  }
  return { status: "success" };
}
