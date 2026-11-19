import {
  LONG_MAX,
  NAME_MAX,
  SHORT_MAX,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationInput,
} from "~/lib/registration-form";

const control =
  "w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E] aria-[invalid=true]:border-[#B3261E] disabled:opacity-80";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">
      {message}
    </p>
  );
}

function Section({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-5 rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]">
      <legend className="px-1 text-lg font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

const autoComplete: Record<string, string> = {
  address: "street-address",
  city: "address-level2",
  region: "address-level1",
  country: "country-name",
};

/**
 * The registration form's fields as registrants see them: the name and email, then each field
 * admins set up, with a headline starting a new section. `preview` draws it for admins, with
 * nothing to fill in.
 */
export function RegistrationFields({
  fields,
  input,
  errors = {},
  email,
  preview = false,
}: {
  fields: RegistrationField[];
  input: RegistrationInput;
  errors?: RegistrationErrors;
  email: string | null;
  preview?: boolean;
}) {
  const err = (name: string) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});
  const id = (name: string) => (preview ? `preview-${name}` : name);

  const sections: { legend: string; fields: RegistrationField[] }[] = [{ legend: "About you", fields: [] }];
  for (const f of fields) {
    if (f.kind === "headline") sections.push({ legend: f.label, fields: [] });
    else sections.at(-1)!.fields.push(f);
  }

  const renderField = (f: RegistrationField) => {
    if (f.kind === "paragraph") {
      return <p key={f.key} className="-mt-1 text-sm whitespace-pre-line">{f.label}</p>;
    }
    if (f.kind === "checkbox") {
      return (
        <div key={f.key}>
          <label className="flex gap-3">
            <input
              type="checkbox"
              name={f.key}
              defaultChecked={input.answers[f.key] === true}
              required={f.required}
              disabled={preview}
              className="mt-1 size-4 shrink-0"
              {...err(f.key)}
            />
            <span>
              {f.label} {!f.required && <span className="opacity-80">(optional)</span>}
            </span>
          </label>
          {f.help && <p className="ml-7 text-sm">{f.help}</p>}
          {f.linkUrl && (
            // A new tab, so the answers typed so far stay on this page.
            <a href={f.linkUrl} target="_blank" rel="noopener" className="ml-7 text-sm underline">
              {f.linkText ?? "Read more"} (opens in a new tab)
            </a>
          )}
          <FieldError id={`${f.key}-error`} message={errors[f.key]} />
        </div>
      );
    }
    const props = {
      id: id(f.key),
      name: f.key,
      defaultValue: typeof input.answers[f.key] === "string" ? (input.answers[f.key] as string) : "",
      required: f.required,
      disabled: preview,
      autoComplete: autoComplete[f.key],
      className: control,
      ...err(f.key),
    };
    return (
      <div key={f.key}>
        <label htmlFor={id(f.key)} className="block font-medium">
          {f.label} {!f.required && <span className="font-normal">(optional)</span>}
        </label>
        {f.help && <p className="text-sm">{f.help}</p>}
        {f.kind === "short" ? (
          <input type="text" maxLength={SHORT_MAX} {...props} />
        ) : (
          <textarea rows={f.key === "address" ? 3 : 2} maxLength={LONG_MAX} {...props} />
        )}
        <FieldError id={`${f.key}-error`} message={errors[f.key]} />
      </div>
    );
  };

  return (
    <>
      {sections.map((section, i) =>
        i === 0 ? (
          <Section key="about-you" legend={section.legend}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={id("firstName")} className="block font-medium">First name</label>
                <input id={id("firstName")} name="firstName" type="text" autoComplete="given-name" maxLength={NAME_MAX} required disabled={preview} defaultValue={input.firstName} className={control} {...err("firstName")} />
                <FieldError id="firstName-error" message={errors.firstName} />
              </div>
              <div>
                <label htmlFor={id("lastName")} className="block font-medium">Last name</label>
                <input id={id("lastName")} name="lastName" type="text" autoComplete="family-name" maxLength={NAME_MAX} required disabled={preview} defaultValue={input.lastName} className={control} {...err("lastName")} />
                <FieldError id="lastName-error" message={errors.lastName} />
              </div>
            </div>
            <div>
              <p className="font-medium">Email</p>
              <p>{email ?? "name@example.org"}</p>
              <p className="text-sm">The email on your account. Limicon writes to you here.</p>
            </div>
            {section.fields.map(renderField)}
          </Section>
        ) : (
          <Section key={`${section.legend}-${i}`} legend={section.legend}>
            {section.fields.length ? section.fields.map(renderField) : <span />}
          </Section>
        ),
      )}
    </>
  );
}
