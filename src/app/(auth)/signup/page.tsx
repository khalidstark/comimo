import type { Metadata } from "next";
import { art } from "@/art/manifest";
import { AuthShell } from "../AuthShell";

export const metadata: Metadata = { title: "Start your comic book" };

export default function SignUpPage() {
  return (
    <AuthShell
      mode="signup"
      kicker="Issue #1"
      title="Start your comic book"
      lede="A name, an email and a password. Then tell Comimo about today."
      art={art.how.book}
      bubble="Takes about twenty seconds!"
    />
  );
}
