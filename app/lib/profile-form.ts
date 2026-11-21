/**
 * Reads the profile editor's form into a profile to save, or field errors to show beside it.
 * Shared by the editor's action and its tests.
 */
import { IMAGE_KEY } from "~/lib/media";
import { linkUrl, MAX_LINKS, platformById } from "~/lib/profile-links";

export const LIMITS = {
  name: 60,
  headline: 150,
  bioWords: 1000,
  /** Characters, a backstop well above what 1,000 words take. */
  bio: 10000,
  location: 100,
  businessName: 150,
  title: 100,
  titles: 5,
  keyword: 40,
  keywords: 30,
  projectKeywords: 150,
  projectDescription: 3000,
  projects: 5,
} as const;

export type ProfileLink = { platform: string; value: string };
export type ProfileProject = { keywords: string; description: string };

export type ProfileEdit = {
  firstName: string;
  lastName: string;
  avatarKey: string | null;
  headline: string | null;
  /** Plain text; blank lines separate paragraphs. */
  bio: string | null;
  location: string | null;
  businessName: string | null;
  titles: string[];
  showEmail: boolean;
  links: ProfileLink[];
  skills: string[];
  interests: string[];
  projects: ProfileProject[];
};

export type ProfileErrors = Partial<Record<string, string>>;

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const all = (form: FormData, name: string) => form.getAll(name).map((v) => String(v).trim());

/** How many words `value` has, as the editor's counter shows. */
export const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/** One space between words, so "Systems  thinking" and "Systems thinking" are one keyword. */
export const cleanKeyword = (value: string) => value.trim().replace(/^#/, "").replace(/\s+/g, " ");

/** Splits typed keywords on commas, dropping blanks and repeats (ignoring case), first spelling kept. */
export function splitKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keyword of values.flatMap((v) => v.split(",")).map(cleanKeyword)) {
    if (!keyword || seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    out.push(keyword);
  }
  return out;
}

export function parseProfileForm(form: FormData): { edit: ProfileEdit; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  const optional = (name: string, max: number, label: string) => {
    const value = text(form, name).replace(/\s+/g, " ");
    if (value.length > max) errors[name] = `${label} can be up to ${max} characters.`;
    return value || null;
  };

  const firstName = text(form, "firstName");
  const lastName = text(form, "lastName");
  if (!firstName) errors.firstName = "Enter your first name.";
  else if (firstName.length > LIMITS.name) errors.firstName = `Up to ${LIMITS.name} characters.`;
  if (lastName.length > LIMITS.name) errors.lastName = `Up to ${LIMITS.name} characters.`;

  const avatar = text(form, "avatarKey");
  if (avatar && !IMAGE_KEY.test(avatar)) errors.avatarKey = "Upload the picture again.";

  // Keeps line breaks, so members can write paragraphs; trims trailing spaces and runs of blank lines.
  const bio = text(form, "bio").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  if (countWords(bio) > LIMITS.bioWords) errors.bio = `Your bio can be up to ${LIMITS.bioWords.toLocaleString("en-US")} words.`;
  else if (bio.length > LIMITS.bio) errors.bio = `Your bio can be up to ${LIMITS.bio.toLocaleString("en-US")} characters.`;

  const titles = all(form, "title").filter(Boolean);
  if (titles.length > LIMITS.titles) errors.titles = `List up to ${LIMITS.titles} titles.`;
  else if (titles.some((t) => t.length > LIMITS.title)) errors.titles = `Each title can be up to ${LIMITS.title} characters.`;

  const platforms = all(form, "linkPlatform");
  const values = all(form, "linkValue");
  const links: ProfileLink[] = [];
  values.forEach((value, i) => {
    if (!value) return;
    const platform = platforms[i] ?? "";
    if (!platformById(platform)) errors[`link-${i}`] = "Choose where this link goes.";
    else if (!linkUrl(platform, value)) {
      errors[`link-${i}`] = platform === "website"
        ? "Enter a full web address, such as https://example.com."
        : `That doesn't look like a ${platformById(platform)!.label} address or username.`;
    }
    links.push({ platform, value });
  });
  if (links.length > MAX_LINKS) errors.links = `Add up to ${MAX_LINKS} links.`;

  const keywords = (kind: "skill" | "interest", label: string) => {
    const list = splitKeywords([...all(form, kind), text(form, `${kind}Draft`)]);
    if (list.length > LIMITS.keywords) errors[`${kind}s`] = `Add up to ${LIMITS.keywords} ${label}.`;
    else if (list.some((k) => k.length > LIMITS.keyword)) errors[`${kind}s`] = `Each keyword can be up to ${LIMITS.keyword} characters.`;
    return list;
  };
  const skills = keywords("skill", "skills");
  const interests = keywords("interest", "interests");

  const projectKeywords = all(form, "projectKeywords");
  const descriptions = all(form, "projectDescription");
  const projects: ProfileProject[] = [];
  projectKeywords.forEach((keywords, i) => {
    const description = (descriptions[i] ?? "").replace(/\r\n/g, "\n");
    if (!keywords && !description) return;
    if (!keywords) errors[`project-${i}`] = "Give this project a few keywords.";
    else if (keywords.length > LIMITS.projectKeywords) errors[`project-${i}`] = `Keywords can be up to ${LIMITS.projectKeywords} characters.`;
    else if (description.length > LIMITS.projectDescription) errors[`project-${i}`] = `The description can be up to ${LIMITS.projectDescription} characters.`;
    projects.push({ keywords: keywords.replace(/\s+/g, " "), description });
  });
  if (projects.length > LIMITS.projects) errors.projects = `Add up to ${LIMITS.projects} projects.`;

  return {
    edit: {
      firstName,
      lastName,
      avatarKey: avatar || null,
      headline: optional("headline", LIMITS.headline, "Your headline"),
      bio: bio || null,
      location: optional("location", LIMITS.location, "Location"),
      businessName: optional("businessName", LIMITS.businessName, "Business name"),
      titles,
      showEmail: form.get("showEmail") === "on",
      links,
      skills,
      interests,
      projects,
    },
    errors,
  };
}
