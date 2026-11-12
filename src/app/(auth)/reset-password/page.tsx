import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" subtitle="At least 8 characters. You'll be signed in when it's saved.">
      <ResetForm />
    </AuthCard>
  );
}
