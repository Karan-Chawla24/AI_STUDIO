import { AuthForm } from "@/components/auth-form";
export const metadata = { title: "Sign in" };
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="sign-in" registered={params.registered === "1"} />;
}
