import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth";
import { ROLE_LABELS } from "@/constants/roles";
import { ApiError } from "@/services/api/client";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const source = useAuthStore((s) => s.source);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({ name, email });
    toast.success("Profile updated");
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      await changePassword(oldPw, newPw);
      toast.success("Password changed. Sign in again.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div>
      <PageHeader title="My profile" description="Manage your personal information and account preferences." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <p className="mt-4 text-base font-semibold">{user?.name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <span className="mt-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {user ? ROLE_LABELS[user.role] : ""}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">Session: {source === "api" ? "Django JWT" : "local mock"}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Personal information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Save changes</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="oldPw">Current password</Label>
                <Input id="oldPw" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPw">New password</Label>
                <Input id="newPw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={10} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={savingPw || source !== "api"}>
                  {source === "api" ? "Update password" : "Requires live backend session"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
