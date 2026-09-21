import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/constants/roles";
import { setTokenProvider } from "@/services/api/client";
import {
  changePasswordRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  pickPrimaryRole,
  type AuthUserDto,
} from "@/services/api/auth";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  roles: Role[];
  avatarUrl?: string;
  mustChangePassword?: boolean;
}

export type AuthSource = "api" | "mock";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  source: AuthSource;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: Partial<AuthUser>) => void;
  setHydrated: () => void;
}

const DEMO_USERS: Array<AuthUser & { password: string }> = [
  { id: "u-1", name: "Admin", email: "admin@ecowrap.com", role: "administrator", roles: ["administrator"], password: "admin123" },
  { id: "u-2", name: "Rajesh Sharma", email: "manager@ecowrap.com", role: "manager", roles: ["manager"], password: "demo123" },
  { id: "u-3", name: "Sita Rai", email: "sales@ecowrap.com", role: "sales", roles: ["sales"], password: "demo123" },
  { id: "u-6", name: "Maya Shrestha", email: "purchase@ecowrap.com", role: "purchase", roles: ["purchase"], password: "demo123" },
  { id: "u-8", name: "Bikash Thapa", email: "production@ecowrap.com", role: "production", roles: ["production"], password: "demo123" },
  { id: "u-4", name: "Hari Karki", email: "warehouse@ecowrap.com", role: "warehouse", roles: ["warehouse"], password: "demo123" },
  { id: "u-5", name: "QC Lead", email: "qc@ecowrap.com", role: "quality_control", roles: ["quality_control"], password: "demo123" },
  { id: "u-7", name: "HR Officer", email: "hr@ecowrap.com", role: "hr", roles: ["hr"], password: "demo123" },
];

function fromDto(dto: AuthUserDto): AuthUser {
  const role = pickPrimaryRole(dto.roles);
  const roles = dto.roles.filter((r): r is Role => DEMO_USERS.some((d) => d.role === r) || r === "hr" || r === "viewer" || r === role);
  return {
    id: dto.id,
    name: dto.full_name || [dto.first_name, dto.last_name].filter(Boolean).join(" ") || dto.email,
    email: dto.email,
    role,
    roles: roles.length ? roles : [role],
    mustChangePassword: dto.must_change_password,
  };
}

function mockLogin(email: string, password: string): AuthUser {
  const found = DEMO_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  );
  if (!found) throw new Error("Invalid email or password");
  const { password: _pw, ...user } = found;
  return user;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      source: "mock",
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      login: async (email, password) => {
        try {
          const data = await loginRequest(email, password);
          const user = fromDto(data.user);
          set({
            user,
            token: data.access,
            refreshToken: data.refresh,
            source: "api",
          });
          return user;
        } catch (err) {
          const user = mockLogin(email, password);
          set({
            user,
            token: `mock.jwt.${user.id}.${Date.now()}`,
            refreshToken: null,
            source: "mock",
          });
          void err;
          return user;
        }
      },
      logout: async () => {
        const { refreshToken, source, token } = get();
        if (source === "api" && refreshToken && token && !token.startsWith("mock.")) {
          try {
            await logoutRequest(refreshToken);
          } catch {
            /* still clear local session */
          }
        }
        set({ user: null, token: null, refreshToken: null, source: "mock" });
      },
      refreshMe: async () => {
        if (get().source !== "api") return;
        try {
          const dto = await meRequest();
          set({ user: fromDto(dto) });
        } catch {
          /* keep cached user */
        }
      },
      changePassword: async (oldPassword, newPassword) => {
        if (get().source !== "api") {
          throw new Error("Password change requires a live backend session.");
        }
        await changePasswordRequest(oldPassword, newPassword);
        set({ user: null, token: null, refreshToken: null, source: "mock" });
      },
      updateProfile: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
    }),
    {
      name: "ecowrap-auth",
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        refreshToken: s.refreshToken,
        source: s.source,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

setTokenProvider({
  getAccess: () => useAuthStore.getState().token,
  getRefresh: () => useAuthStore.getState().refreshToken,
  setTokens: (access, refresh) => useAuthStore.setState({ token: access, refreshToken: refresh, source: "api" }),
  clear: () => useAuthStore.setState({ user: null, token: null, refreshToken: null, source: "mock" }),
});

export const DEMO_ACCOUNTS = DEMO_USERS.map(({ password, ...u }) => ({
  ...u,
  password,
}));

export function isLiveSession(): boolean {
  const s = useAuthStore.getState();
  return s.source === "api" && !!s.token && !s.token.startsWith("mock.");
}
