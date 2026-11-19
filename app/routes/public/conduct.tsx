import { CodeOfConduct } from "~/content/policies";
import type { Route } from "./+types/conduct";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Code of Conduct · Limicon" },
    { name: "description", content: "What Limicon expects of participants, and how to get help." },
  ];
}

export default function Conduct() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold">Code of Conduct</h1>
      <CodeOfConduct />
    </main>
  );
}
