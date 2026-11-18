import { data, Form, Link, redirect, useNavigation } from "react-router";

import { servicesContext } from "~/context";
import {
  AGREEMENTS,
  checkRegistrationForm,
  LOCATION_KEYS,
  LONG_MAX,
  readRegistrationForm,
  REFLECTION_KEYS,
  SHORT_MAX,
  TEXT_QUESTIONS,
  NAME_MAX,
  type RegistrationErrors,
  type RegistrationInput,
  type TextKey,
} from "~/lib/registration-form";
import { getRegistration, hasTicket, isRegistrationOpen, saveRegistration } from "~/lib/registration.server";
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
  if (state.stage !== "form") return { state, input: null, submitted: false, saved: false };
  const { input, submitted } = await getRegistration(context.get(servicesContext).db(), state.userId, state.editionId);
  const saved = new URL(request.url).searchParams.has("saved");
  return {
    state: { stage: state.stage, year: state.year, open: state.open, email: state.email },
    input,
    submitted,
    saved,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const state = await registrationState(context);
  if (state.stage !== "form") throw redirect("/tickets");
  const input = readRegistrationForm(await request.formData());
  const result = checkRegistrationForm(input);
  if (!result.ok) return data({ input, errors: result.errors }, { status: 400 });
  await saveRegistration(context.get(servicesContext).db(), state.userId, state.editionId, result.values);
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
        input={actionData?.input ?? input}
        errors={actionData?.errors ?? {}}
        email={state.email}
      />
    </main>
  );
}

const field =
  "w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E] aria-[invalid=true]:border-[#B3261E]";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">
      {message}
    </p>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-5 rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]">
      <legend className="px-1 text-lg font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function errorProps(name: keyof RegistrationInput, errors: RegistrationErrors) {
  return errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};
}

const questions = new Map(TEXT_QUESTIONS.map((q) => [q.key, q]));

function TextQuestion({ name, input, errors }: { name: TextKey; input: RegistrationInput; errors: RegistrationErrors }) {
  const q = questions.get(name)!;
  const help = "help" in q ? q.help : null;
  const props = {
    id: name,
    name,
    defaultValue: input[name],
    required: q.required,
    className: field,
    ...errorProps(name, errors),
  };
  return (
    <div>
      <label htmlFor={name} className="block font-medium">
        {q.label} {!q.required && <span className="font-normal">(optional)</span>}
      </label>
      {help && <p className="text-sm">{help}</p>}
      {q.kind === "short" ? (
        <input type="text" maxLength={SHORT_MAX} autoComplete={autoComplete[name]} {...props} />
      ) : (
        <textarea rows={name === "address" ? 3 : 2} maxLength={LONG_MAX} autoComplete={autoComplete[name]} {...props} />
      )}
      <FieldError id={`${name}-error`} message={errors[name]} />
    </div>
  );
}

const autoComplete: Partial<Record<TextKey, string>> = {
  address: "street-address",
  city: "address-level2",
  region: "address-level1",
  country: "country-name",
};

function RegistrationForm({
  input,
  errors,
  email,
}: {
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

      <Fieldset legend="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="block font-medium">First name</label>
            <input id="firstName" name="firstName" type="text" autoComplete="given-name" maxLength={NAME_MAX} required defaultValue={input.firstName} className={field} {...errorProps("firstName", errors)} />
            <FieldError id="firstName-error" message={errors.firstName} />
          </div>
          <div>
            <label htmlFor="lastName" className="block font-medium">Last name</label>
            <input id="lastName" name="lastName" type="text" autoComplete="family-name" maxLength={NAME_MAX} required defaultValue={input.lastName} className={field} {...errorProps("lastName", errors)} />
            <FieldError id="lastName-error" message={errors.lastName} />
          </div>
        </div>
        <div>
          <p className="font-medium">Email</p>
          <p>{email}</p>
          <p className="text-sm">The email on your account. Limicon writes to you here.</p>
        </div>
        <TextQuestion name="address" input={input} errors={errors} />
      </Fieldset>

      <Fieldset legend="Location">
        <p className="-mt-2 text-sm">Where you'll mostly be during Limicon.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {LOCATION_KEYS.map((key) => (
            <TextQuestion key={key} name={key} input={input} errors={errors} />
          ))}
        </div>
      </Fieldset>

      <Fieldset legend="What you hope for">
        <p className="-mt-2 text-sm">Answer any that speak to you. They help hosts and other members find you.</p>
        {REFLECTION_KEYS.map((key) => (
          <TextQuestion key={key} name={key} input={input} errors={errors} />
        ))}
        <TextQuestion name="heard_about" input={input} errors={errors} />
      </Fieldset>

      <Fieldset legend="Agreements">
        {AGREEMENTS.map((a) => (
          <div key={a.key}>
            <label className="flex gap-3">
              <input type="checkbox" name={a.key} defaultChecked={input[a.key]} required className="mt-1 size-4 shrink-0" {...errorProps(a.key, errors)} />
              <span>{a.label}</span>
            </label>
            <FieldError id={`${a.key}-error`} message={errors[a.key]} />
          </div>
        ))}
      </Fieldset>

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
