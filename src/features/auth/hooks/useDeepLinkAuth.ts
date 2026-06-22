import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAuthStore } from "../store/auth-store";
import { api, claimAppSession } from "@/lib/api-client";
import { toast } from "@/lib/toast-store";

const AUTH_SCHEME = "ihostmc";
const AUTH_PATH = "auth";
const SESSION_POLL_INTERVAL_MS = 1500;
const SESSION_POLL_TIMEOUT_MS = 60 * 1000;

export interface AuthPayload {
  token: string;
  userId: string;
  email: string;
  exp?: number;
}

function parseAuthUrl(url: string): AuthPayload | null {
  try {
    const normalized = url.trim();
    if (!normalized.toLowerCase().startsWith(`${AUTH_SCHEME}:`) || !normalized.includes(AUTH_PATH)) return null;
    const u = new URL(normalized);
    const payloadB64 = u.searchParams.get("payload");
    if (!payloadB64) return null;
    const rawB64 = decodeURIComponent(payloadB64);
    const json = decodeURIComponent(escape(atob(rawB64.replace(/-/g, "+").replace(/_/g, "/"))));
    const data = JSON.parse(json) as AuthPayload & { exp?: number };
    if (!data.token || !data.userId || !data.email) return null;
    if (typeof data.exp === "number" && Date.now() > data.exp) return null;
    return { token: data.token, userId: data.userId, email: data.email };
  } catch {
    return null;
  }
}

/** Parse ihostmc://auth?session=XXX (website-initiated; app polls backend to claim token). */
function parseAuthSessionUrl(url: string): string | null {
  try {
    const normalized = url.trim();
    if (!normalized.toLowerCase().startsWith(`${AUTH_SCHEME}:`)) return null;
    const u = new URL(normalized);
    const fromQuery = u.searchParams.get("session")?.trim();
    if (fromQuery) return fromQuery;
    if (u.pathname.includes(AUTH_PATH)) {
      return u.searchParams.get("session")?.trim() ?? null;
    }
    const match = normalized.match(/[?&]session=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : null;
  } catch {
    const match = url.match(/[?&]session=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : null;
  }
}

async function pollSessionAndSignIn(sessionId: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < SESSION_POLL_TIMEOUT_MS) {
    const auth = await claimAppSession(sessionId);
    if (auth && (await applyPayload(auth))) return true;
    await new Promise((r) => setTimeout(r, SESSION_POLL_INTERVAL_MS));
  }
  return false;
}

export async function applyPayload(payload: AuthPayload): Promise<boolean> {
  try {
    const me = await api.me(payload.token);
    useAuthStore.getState().setUser({
      token: payload.token,
      userId: me.userId,
      email: me.email,
    });
    return true;
  } catch {
    return false;
  }
}

function showSignedInToast(email: string): void {
  toast.success(`Signed in as ${email}`);
}

async function focusMainWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
  } catch {
    // ignore
  }
}

async function handleAuthUrls(urls: string[]): Promise<void> {
  for (const url of urls) {
    const payload = parseAuthUrl(url);
    if (payload) {
      if (await applyPayload(payload)) {
        showSignedInToast(payload.email);
        await focusMainWindow();
      }
      return;
    }
    const sessionId = parseAuthSessionUrl(url);
    if (sessionId) {
      if (await pollSessionAndSignIn(sessionId)) {
        const u = useAuthStore.getState().user;
        if (u?.email) showSignedInToast(u.email);
        await focusMainWindow();
      }
      return;
    }
  }
}

/**
 * Listens for ihostmc://auth deep links (session or payload) and dev server handoff events.
 * Signs the user in and shows a toast. Run only when isTauri() is true.
 */
export function useDeepLinkAuth(): void {
  useEffect(() => {
    if (typeof window === "undefined" || !(window as Window & { __TAURI__?: unknown }).__TAURI__) return;

    let unsubOpenUrl: (() => void) | undefined;
    let unsubDevAuth: (() => void) | undefined;
    let unsubRustDeepLink: (() => void) | undefined;

    (async () => {
      const unsubDev = await listen<AuthPayload>("deep-link-auth", async (e) => {
        const p = e.payload;
        if (p?.token && p?.userId && p?.email) {
          try {
            if (await applyPayload(p)) {
              showSignedInToast(p.email);
              await focusMainWindow();
            }
          } catch {
            // ignore
          }
        }
      });
      unsubDevAuth = () => unsubDev();

      const unsubRust = await listen<string[]>("deep-link-open", (e) => {
        if (e.payload?.length) handleAuthUrls(e.payload);
      });
      unsubRustDeepLink = () => unsubRust();

      const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      const urls = await getCurrent();
      if (urls?.length) await handleAuthUrls(urls);

      unsubOpenUrl = await onOpenUrl((incoming) => {
        handleAuthUrls(incoming);
      });
    })();

    return () => {
      unsubOpenUrl?.();
      unsubDevAuth?.();
      unsubRustDeepLink?.();
    };
  }, []);
}
