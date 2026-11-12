import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
