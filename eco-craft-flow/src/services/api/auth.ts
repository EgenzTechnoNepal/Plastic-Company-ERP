import { apiFetch } from "./client";
import type { Role } from "@/constants/roles";
import { ROLES } from "@/constants/roles";

export interface AuthUserDto {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_superuser: boolean;
  is_staff: boolean;
  must_change_password: boolean;
  roles: string[];
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: AuthUserDto;
}

export function pickPrimaryRole(roles: string[]): Role {
  const known = roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  if (known.includes("administrator")) return "administrator";
  if (known.includes("manager")) return "manager";
  return known[0] ?? "viewer";
}

export function loginRequest(email: string, password: string) {
  return apiFetch<LoginResponse>("/auth/login/", {
    method: "POST",
    body: { email, password },
    anonymous: true,
    silent: true,
  });
}

export function refreshRequest(refresh: string) {
  return apiFetch<{ access: string; refresh?: string }>("/auth/refresh/", {
    method: "POST",
    body: { refresh },
    anonymous: true,
    silent: true,
  });
}

export function logoutRequest(refresh: string) {
  return apiFetch<{ detail: string }>("/auth/logout/", {
    method: "POST",
    body: { refresh },
    silent: true,
  });
}

export function meRequest() {
  return apiFetch<AuthUserDto>("/auth/me/", { silent: true });
}

export function changePasswordRequest(old_password: string, new_password: string) {
  return apiFetch<{ detail: string }>("/auth/change-password/", {
    method: "POST",
    body: { old_password, new_password },
    silent: true,
  });
}

export function passwordResetRequest(email: string) {
  return apiFetch<{ detail: string; token?: string }>("/auth/password-reset/", {
    method: "POST",
    body: { email },
    anonymous: true,
    silent: true,
  });
}

export function passwordResetConfirmRequest(token: string, new_password: string) {
  return apiFetch<{ detail: string }>("/auth/password-reset/confirm/", {
    method: "POST",
    body: { token, new_password },
    anonymous: true,
    silent: true,
  });
}
