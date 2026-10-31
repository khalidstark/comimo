import type { Metadata } from "next";
import { art } from "@/art/manifest";
import { AuthShell } from "../AuthShell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell
      mode="signin"
      kicker="Welcome back"
      title="Sign in to Comimo"
      lede="Your cast is waiting. Pick up where today left off."
      art={art.how.talk}
      bubble="Back already? Tell me everything."
    />
  );
}
