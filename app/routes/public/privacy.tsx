import { PrivacyPolicy } from "~/content/policies";
import type { Route } from "./+types/privacy";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy Policy · Limicon" },
    { name: "description", content: "How Limicon sessions, recordings and participant information are kept private." },
  ];
}

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold">Privacy Policy</h1>
      <PrivacyPolicy />
    </main>
  );
}
