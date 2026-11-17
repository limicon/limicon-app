/** A Members-area section that isn't built yet: its title and what it will hold. */
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-3 inline-block rounded-full bg-[#F9DCBD] px-3 py-0.5 text-sm font-semibold text-[#5A3612]">
        Coming soon
      </p>
      <p className="mt-4">{children}</p>
    </section>
  );
}
