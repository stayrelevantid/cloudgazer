"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Hook that returns an auth-aware fetch function.
 * - Automatically attaches the Clerk JWT token
 * - Redirects to /sign-in if the token is null (session expired)
 * - Redirects to /sign-in on 401/403 responses (stale token)
 * - Throws on non-ok responses for proper error handling
 */
export function useAuthFetch() {
    const { getToken } = useAuth();

    const authFetch = useCallback(async (url: string, options?: RequestInit): Promise<Response> => {
        const token = await getToken();
        if (!token) {
            window.location.href = "/sign-in";
            throw new Error("Session expired");
        }

        const headers = {
            ...options?.headers,
            "Authorization": `Bearer ${token}`,
        };

        const res = await fetch(url, { ...options, headers });

        if (res.status === 401 || res.status === 403) {
            window.location.href = "/sign-in";
            throw new Error("Session expired");
        }

        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }

        return res;
    }, [getToken]);

    return { authFetch };
}
