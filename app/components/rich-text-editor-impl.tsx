import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";

import { FILE_ACCEPT, IMAGE_ACCEPT } from "~/lib/media";
import type { RichDoc } from "~/lib/rich-text";

/**
 * The editor itself, loaded only in the browser through `RichTextEditor` (rich-text-editor.tsx):
 * TipTap can't run in the Worker. A word-processor-style editor for admins: bold, italic, underline, strikethrough, headings,
 * lists, quotes, alignment, links, emoji, and uploaded images and files. It posts the document
 * as JSON in a hidden field called `name`; the server cleans it before saving.
 *
 * `initial` is a saved document, or HTML to start from (such as a policy's built-in text).
 * `basic` keeps to text formatting, lists, quotes, links and emoji, for members: no headings,
 * alignment or uploads, which go through the admin console.
 */
export default function RichTextEditorImpl({
  name,
  initial,
  label,
  describedBy,
  basic = false,
}: {
  name: string;
  initial: RichDoc | string | null;
  label: string;
  describedBy?: string;
  basic?: boolean;
}) {
  const [json, setJson] = useState(() => (initial && typeof initial !== "string" ? JSON.stringify(initial) : ""));
  const [problem, setProblem] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: basic ? false : { levels: [2, 3, 4] },
        horizontalRule: basic ? false : undefined,
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["mailto"], HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      ...(basic ? [] : [Image, TextAlign.configure({ types: ["heading", "paragraph"] })]),
    ],
    content: initial ?? "",
    // The server can't run the editor, so it draws on the client only.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `rich-text-editor ${basic ? "min-h-32" : "min-h-48"} px-3 py-2 focus:outline-none`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      },
    },
    onCreate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });

  return (
    <div className="rounded border border-[#9DB5B9] bg-white dark:border-[#3A5359] dark:bg-[#0F1C1E]">
      <input type="hidden" name={name} value={json} />
      {editor ? <Toolbar editor={editor} onProblem={setProblem} basic={basic} /> : <div className="h-11 border-b border-[#C9DADC] dark:border-[#24363B]" />}
      {problem && (
        <p role="alert" className="border-b border-[#E8B4B0] bg-[#FCEDEC] px-3 py-2 text-sm text-[#5C1712]">
          {problem}
        </p>
      )}
      <EditorContent editor={editor} />
      {!editor && <p className="px-3 py-2 text-sm opacity-70">Loading the editor…</p>}
    </div>
  );
}

const EMOJI = "😀 😊 🙂 😍 🥰 🤗 🤩 😎 🤔 😮 🙏 👏 🙌 👋 💪 ❤️ 🧡 💛 💚 💙 💜 ✨ 🌟 ⭐ 🔥 🌱 🌿 🌸 🌻 🌍 🌎 🌏 ☀️ 🌙 🌈 🎉 🎊 🎁 📅 ⏰ 📍 📣 💡 📚 ✍️ 🎨 🎵 🧘 🤝 ✅ ❗ ❓ ➡️".split(" ");

function Toolbar({ editor, onProblem, basic }: { editor: Editor; onProblem: (message: string | null) => void; basic: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [panel, setPanel] = useState<"link" | "emoji" | null>(null);
  const [href, setHref] = useState("");
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();

  async function upload(file: File, images: boolean) {
    onProblem(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (images) body.set("images", "1");
      const response = await fetch("/admin/upload", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as { url?: string; name?: string; error?: string } | null;
      if (!response.ok || !result?.url) throw new Error(result?.error ?? "The upload didn't work. Try again.");
      if (images) chain().setImage({ src: result.url, alt: "" }).run();
      else chain().insertContent({ type: "text", text: result.name ?? "Download", marks: [{ type: "link", attrs: { href: result.url } }] }).insertContent(" ").run();
    } catch (error) {
      onProblem((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function applyLink() {
    const value = href.trim();
    if (!value) chain().extendMarkRange("link").unsetLink().run();
    else {
      const url = /^(https?:\/\/|mailto:|\/)/i.test(value) ? value : value.includes("@") && !value.includes("/") ? `mailto:${value}` : `https://${value}`;
      if (editor.state.selection.empty && !state.link) chain().insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href: url } }] }).run();
      else chain().extendMarkRange("link").setLink({ href: url }).run();
    }
    setPanel(null);
  }

  return (
    <div className="border-b border-[#C9DADC] dark:border-[#24363B]">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 p-1">
        <Tool label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}><b>B</b></Tool>
        <Tool label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></Tool>
        <Tool label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></Tool>
        <Tool label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></Tool>
        <Divider />
        {!basic && (
          <>
            <Tool label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H1</Tool>
            <Tool label="Subheading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H2</Tool>
          </>
        )}
        <Tool label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>• List</Tool>
        <Tool label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</Tool>
        <Tool label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>❝</Tool>
        <Divider />
        {!basic && (
          <>
            <Tool label="Align left" active={!state.center && !state.right} onClick={() => chain().setTextAlign("left").run()}>⇤</Tool>
            <Tool label="Center" active={state.center} onClick={() => chain().setTextAlign("center").run()}>↔</Tool>
            <Tool label="Align right" active={state.right} onClick={() => chain().setTextAlign("right").run()}>⇥</Tool>
            <Divider />
          </>
        )}
        <Tool
          label="Link"
          active={state.link || panel === "link"}
          onClick={() => {
            setHref((editor.getAttributes("link").href as string | undefined) ?? "");
            setPanel(panel === "link" ? null : "link");
          }}
        >
          🔗 Link
        </Tool>
        <Tool label="Emoji" active={panel === "emoji"} onClick={() => setPanel(panel === "emoji" ? null : "emoji")}>😊</Tool>
        {!basic && (
          <>
            <Tool label="Add image" disabled={uploading} onClick={() => imageInput.current?.click()}>🖼 Image</Tool>
            <Tool label="Attach file" disabled={uploading} onClick={() => fileInput.current?.click()}>📎 File</Tool>
            <Tool label="Line" onClick={() => chain().setHorizontalRule().run()}>―</Tool>
          </>
        )}
        <Divider />
        <Tool label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>↶</Tool>
        <Tool label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>↷</Tool>
        {uploading && <span className="px-2 text-sm" role="status">Uploading…</span>}
      </div>
      {panel === "link" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E8E9] p-2 dark:border-[#24363B]">
          <label htmlFor={`${editor.instanceId}-href`} className="text-sm font-medium">Link to</label>
          <input
            id={`${editor.instanceId}-href`}
            value={href}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
            }}
            placeholder="https://… or an email address"
            className="min-w-60 flex-1 rounded border border-[#9DB5B9] px-2 py-1 text-sm dark:border-[#3A5359] dark:bg-[#0F1C1E]"
          />
          <button type="button" onClick={applyLink} className="rounded bg-[#15383F] px-3 py-1 text-sm font-semibold text-[#F3E6D7]">
            Apply
          </button>
          {state.link && (
            <button type="button" onClick={() => { chain().extendMarkRange("link").unsetLink().run(); setPanel(null); }} className="px-2 py-1 text-sm underline">
              Remove link
            </button>
          )}
        </div>
      )}
      {panel === "emoji" && (
        <div className="flex flex-wrap gap-0.5 border-t border-[#E2E8E9] p-2 dark:border-[#24363B]">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Insert ${emoji}`}
              onClick={() => chain().insertContent(emoji).run()}
              className="rounded px-1.5 py-1 text-lg hover:bg-black/5 dark:hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <input
        ref={imageInput}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file, true);
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept={FILE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file, false);
        }}
      />
    </div>
  );
}

function Tool({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the editor's selection when a button is clicked.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`min-w-8 rounded px-2 py-1 text-sm disabled:opacity-40 ${
        active ? "bg-[#15383F] text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]" : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-[#C9DADC] dark:bg-[#3A5359]" />;
}
