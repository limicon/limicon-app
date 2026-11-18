import { data, Form, redirect, useNavigation } from "react-router";

import { Badge, card, dangerButton, FieldError, formatWhen, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { FaqAnswer } from "~/components/faq-answer";
import { servicesContext } from "~/context";
import { checkFaqForm, FAQ_ANSWER_MAX, FAQ_QUESTION_MAX, type FaqInput } from "~/lib/admin-forms";
import { addFaq, deleteFaq, listAllFaq, moveFaq, updateFaq } from "~/lib/faq.server";
import type { Route } from "./+types/faq";

export function meta({}: Route.MetaArgs) {
  return [{ title: "FAQ · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  return { entries: await listAllFaq(services.db()), done: new URL(request.url).searchParams.get("done") };
}

type ActionData = { entryId: number | null; input: FaqInput; errors: Partial<Record<keyof FaqInput, string>> };

export async function action({ context, request }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const by = services.viewer!.userId;
  const form = await request.formData();
  const intent = form.get("intent");
  const id = Number(form.get("entryId"));

  if (intent === "add" || intent === "save") {
    const entryId = intent === "save" ? id : null;
    const result = checkFaqForm(form);
    if (!result.ok) return data<ActionData>({ entryId, input: result.input, errors: result.errors }, { status: 400 });
    if (entryId === null) await addFaq(db, result.values, by);
    else await updateFaq(db, entryId, result.values, by);
    throw redirect(`/admin/faq?done=${entryId === null ? "added" : "saved"}${entryId === null ? "" : `#entry-${entryId}`}`);
  }
  if (intent === "up" || intent === "down") {
    await moveFaq(db, id, intent === "up" ? -1 : 1);
    throw redirect(`/admin/faq#entry-${id}`);
  }
  if (intent === "delete") {
    await deleteFaq(db, id);
    throw redirect("/admin/faq?done=deleted");
  }
  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  added: "Question added.",
  saved: "Saved.",
  deleted: "Question deleted.",
};

/** The public FAQ's questions and answers, which admins add to and update as questions come in. */
export default function AdminFaq({ loaderData, actionData }: Route.ComponentProps) {
  const { entries, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const published = entries.filter((e) => e.published).length;
  return (
    <>
      <PageHeading title="FAQ">
        <p>
          The questions and answers on the public <a href="/faq" className="underline">FAQ page</a>. Drafts stay here until you
          publish them. In answers, a blank line starts a new paragraph, and web and email addresses become links.
        </p>
      </PageHeading>
      {done && doneMessages[done] && !actionData && <Notice>{doneMessages[done]}</Notice>}

      <section aria-labelledby="add-heading" className={`${card} mb-8 max-w-3xl`}>
        <h2 id="add-heading" className="mb-3 text-lg font-semibold">Add a question</h2>
        <FaqForm
          entryId={null}
          initial={actionData?.entryId === null ? actionData.input : { question: "", answer: "", published: true }}
          errors={actionData?.entryId === null ? actionData.errors : {}}
          busy={busy}
        />
      </section>

      <h2 className="text-xl font-semibold">
        Questions <span className="text-base font-normal opacity-80">· {published} published of {entries.length}</span>
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3">No questions yet.</p>
      ) : (
        <ol className="mt-3 grid max-w-3xl gap-3">
          {entries.map((entry, index) => {
            const failed = actionData?.entryId === entry.id;
            return (
              <li key={entry.id} id={`entry-${entry.id}`} className={card}>
                <details open={failed}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-semibold">{entry.question}</span>
                    {!entry.published && <Badge tone="amber">Draft</Badge>}
                  </summary>
                  <div className="mt-3 text-sm">
                    <FaqAnswer text={entry.answer} />
                  </div>
                  <p className="mt-3 text-xs opacity-80">
                    Updated {formatWhen(entry.updatedAt)}{entry.updatedBy ? ` by ${entry.updatedBy}` : ""}
                  </p>
                  <div className="mt-4 border-t border-[#E2E8E9] pt-4 dark:border-[#24363B]">
                    <FaqForm
                      entryId={entry.id}
                      initial={failed ? actionData.input : { question: entry.question, answer: entry.answer, published: entry.published }}
                      errors={failed ? actionData.errors : {}}
                      busy={busy}
                    />
                  </div>
                </details>
                <Form method="post" className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="entryId" value={entry.id} />
                  <button type="submit" name="intent" value="up" disabled={busy || index === 0} aria-label={`Move "${entry.question}" up`} className={`${secondaryButton} disabled:opacity-40`}>↑ Up</button>
                  <button type="submit" name="intent" value="down" disabled={busy || index === entries.length - 1} aria-label={`Move "${entry.question}" down`} className={`${secondaryButton} disabled:opacity-40`}>↓ Down</button>
                  <button type="submit" name="intent" value="delete" disabled={busy} className={dangerButton}>Delete</button>
                </Form>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function FaqForm({
  entryId,
  initial,
  errors,
  busy,
}: {
  entryId: number | null;
  initial: FaqInput;
  errors: Partial<Record<keyof FaqInput, string>>;
  busy: boolean;
}) {
  const key = entryId ?? "new";
  const err = (name: keyof FaqInput) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-${key}-error` } : {});
  return (
    <Form method="post" className="grid gap-3" key={JSON.stringify(initial)}>
      {entryId !== null && <input type="hidden" name="entryId" value={entryId} />}
      <div>
        <label htmlFor={`question-${key}`} className="block text-sm font-medium">Question</label>
        <input id={`question-${key}`} name="question" maxLength={FAQ_QUESTION_MAX} defaultValue={initial.question} className={`${inputClass} mt-1`} {...err("question")} />
        <FieldError id={`question-${key}-error`} message={errors.question} />
      </div>
      <div>
        <label htmlFor={`answer-${key}`} className="block text-sm font-medium">Answer</label>
        <textarea id={`answer-${key}`} name="answer" rows={5} maxLength={FAQ_ANSWER_MAX} defaultValue={initial.answer} className={`${inputClass} mt-1`} {...err("answer")} />
        <FieldError id={`answer-${key}-error`} message={errors.answer} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="published" defaultChecked={initial.published} className="size-4" />
        <span>Show on the public FAQ page</span>
      </label>
      <div>
        <button type="submit" name="intent" value={entryId === null ? "add" : "save"} disabled={busy} className={entryId === null ? primaryButton : secondaryButton}>
          {entryId === null ? "Add question" : "Save"}
        </button>
      </div>
    </Form>
  );
}
