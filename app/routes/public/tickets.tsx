import { data, Form, Link, redirect, useNavigation } from "react-router";

import { servicesContext } from "~/context";
import { RegistrationFields } from "~/components/registration-fields";
import {
  checkRegistrationForm,
  readRegistrationForm,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationInput,
} from "~/lib/registration-form";
import { getRegistration, getRegistrationFields, hasTicket, isRegistrationOpen, saveRegistration } from "~/lib/registration.server";
import type { Route } from "./+types/tickets";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Register · Limicon" }];
}

/**
 * Where a visitor stands with registration for the current edition, from no account to holding
 * a ticket. Admins can open the form while registration is closed, to try it out.
 */
async function registrationState(context: Route.LoaderArgs["context"]) {
  const services = context.get(servicesContext);
  const { edition, isAdmin } = await services.membership();
  if (!edition) return { stage: "no-edition" as const };
  const year = edition.year;
  const db = services.db();
  const open = await isRegistrationOpen(db, edition.id);
  if (!open && !isAdmin) return { stage: "closed" as const, year };
  if (!services.viewer) return { stage: "signed-out" as const, year };
  const userId = services.viewer.userId;
  if (await hasTicket(db, userId, edition.id)) return { stage: "registered" as const, year };
  return { stage: "form" as const, year, open, userId, editionId: edition.id, email: services.viewer.email };
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const state = await registrationState(context);
  if (state.stage !== "form") return { state, input: null, fields: [] as RegistrationField[], submitted: false, saved: false };
  const db = context.get(servicesContext).db();
  const fields = await getRegistrationFields(db, state.editionId);
  const { input, submitted } = await getRegistration(db, state.userId, state.editionId, fields);
  const saved = new URL(request.url).searchParams.has("saved");
  return {
    state: { stage: state.stage, year: state.year, open: state.open, email: state.email },
    input,
    fields,
    submitted,
    saved,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const state = await registrationState(context);
  if (state.stage !== "form") throw redirect("/tickets");
  const db = context.get(servicesContext).db();
  const fields = await getRegistrationFields(db, state.editionId);
  const input = readRegistrationForm(await request.formData(), fields);
  const result = checkRegistrationForm(input, fields);
  if (!result.ok) return data({ input, errors: result.errors }, { status: 400 });
  await saveRegistration(db, state.userId, state.editionId, result.values, fields);
  throw redirect("/tickets?saved=1");
}

export default function Tickets({ loaderData, actionData }: Route.ComponentProps) {
  const { state } = loaderData;
  const name = "year" in state && state.year ? `Limicon ${state.year}` : "Limicon";

  const { input } = loaderData;
  if (state.stage !== "form" || !input) {
    return (
      <main className="mx-auto max-w-md p-4 pt-16">
        <h1 className="text-2xl font-semibold">Register for {name}</h1>
        {state.stage === "registered" ? (
          <p className="mt-4">
            You're registered. <Link to="/members" className="underline">Go to the Members area</Link>.
          </p>
        ) : state.stage === "signed-out" ? (
          <p className="mt-4">
            Registering starts with a Limicon account.{" "}
            <Link to="/sign-in" className="underline">Create an account or sign in</Link>, then come back here.
          </p>
        ) : (
          <p className="mt-4">
            Registration isn't open yet. Once it is, this is where you'll register and choose a ticket.
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 pt-16 pb-16">
      <h1 className="text-3xl font-semibold">Register for {name}</h1>
      {!state.open && (
        <p className="mt-4 rounded border border-[#C9A227] bg-[#FFF8E1] p-3 dark:bg-[#3A3214]">
          Registration is closed to the public. You can see this form because you're an admin.
        </p>
      )}
      {loaderData.saved ? (
        <p role="status" className="mt-4 rounded border border-[#4C8C5A] bg-[#EAF5EC] p-3 dark:bg-[#17301C]">
          Your answers are saved. Choosing a ticket and paying comes next; ticket sales aren't open yet.
        </p>
      ) : (
        <p className="mt-4 max-w-[68ch]">
          Tell us about yourself and what you hope for from Limicon. Then you'll choose a ticket.
          {loaderData.submitted && " You've answered these already; you can change your answers."}
        </p>
      )}
      <RegistrationForm
        fields={loaderData.fields}
        input={actionData?.input ?? input}
        errors={actionData?.errors ?? {}}
        email={state.email}
      />
    </main>
  );
}

function RegistrationForm({
  fields,
  input,
  errors,
  email,
}: {
  fields: RegistrationField[];
  input: RegistrationInput;
  errors: RegistrationErrors;
  email: string | null;
}) {
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Form method="post" className="mt-6 grid gap-6" noValidate>
      {hasErrors && (
        <p role="alert" className="rounded border border-[#B3261E] p-3 font-medium text-[#B3261E] dark:text-[#F2B8B5]">
          Some answers need fixing. They're marked below.
        </p>
      )}

      <RegistrationFields fields={fields} input={input} errors={errors} email={email} />

      <div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-[#1F5F68] px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save and continue"}
        </button>
      </div>
    </Form>
  );
}
