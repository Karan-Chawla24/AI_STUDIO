import { AppShell } from "@/components/app-shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getIdentity } from "@/server/auth/service";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  if (!requestHeaders.get("cookie")) redirect("/sign-in");
  const identity = await getIdentity(requestHeaders);
  if (!identity) redirect("/sign-in");
  return <AppShell userName={identity.profile.displayName}>{children}</AppShell>;
}
