/**
 * The host guidelines members accept before hosting (SES-2, MEM-3), from limicon.org's Host a
 * Session page. `year` is the current edition's, so the text needs no yearly edit.
 */
const CONTACT = "https://www.limicon.org/contact";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Tips({ heading, items }: { heading: string; items: [string, string][] }) {
  return (
    <div>
      <h4 className="font-semibold">{heading}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map(([label, text]) => (
          <li key={label + text}>
            {label && <strong>{label}: </strong>}
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HostGuidelines({ year }: { year: number | null }) {
  const members = year ? `Limicon ${year} members` : "Limicon members";
  const edition = year ? `Limicon ${year}` : "this year's Limicon";
  return (
    <div className="grid max-w-[68ch] gap-8 leading-relaxed">
      <Section title="Host guidance">
        <p>
          At Limicon, we experiment with ways we can help strengthen the mycelial network of
          relationships, practices and ideas within the Limicon system. You can help with this as
          you plan your session. One question you can ask yourself is: How is my session in service
          to the greater ecosystem?
        </p>
        <p>
          We ask you to be mindful of the calendar and of other participants as you schedule your
          sessions. Consider how many sessions (especially duplicate sessions) you are adding to the
          calendar. Additionally, the Limicon calendar is open round the clock, and we have many
          guests joining us from around the world, so don't be afraid to push the boundaries of the
          North American time zones with your scheduling.
        </p>
      </Section>

      <Section title="Selecting the appropriate privacy level">
        <p>
          Please familiarize yourself with the privacy levels to ensure you register your session
          under the one that best suits it.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>No recording:</strong> This session will be viewed only by live participants.</li>
          <li>
            <strong>Recorded and shared with session participants only:</strong> You may record your
            session and email the recording to those that attended the session, reminding session
            participants that the recording is not to be shared with anyone else. You may not share
            the recording with anyone that did not attend your session.
          </li>
          <li>
            <strong>Recorded and shared with {members}:</strong> You may record your session, email
            the recording to those that attended the session, and share with the Limicon organizers.
            We will share your recording with {members}. You may not share the recording with anyone
            outside of {edition}.
          </li>
          <li>
            <strong>Recorded and shared publicly:</strong> You may record your session and share as
            you please with the public.
          </li>
        </ul>
        <p>The default privacy level for Limicon is shared with {members}.</p>
        <p>
          Please be mindful that, in some cases, privacy level may influence the quality of your
          session. In sessions with more personal content, people may be less inclined to fully
          participate or share if the session will be publicly available.
        </p>
        <p>
          Please <a className="underline" href={CONTACT}>contact the organizing team</a> with any
          questions or concerns.
        </p>
      </Section>

      <Section title="Tips for session hosts">
        <p>From planning to closing and everything in between, make it accessible, in every sense of the word.</p>
        <Tips heading="Topic" items={[["", "Narrow down your topic enough to maintain focus, while leaving room to hold space for participants."]]} />
        <Tips heading="Length" items={[["", "Select a session length that allows for both sufficient coverage of the topic and meaningful discussion."]]} />
        <Tips
          heading="Engagement"
          items={[
            ["Slideshows", "Fewer than 10 words per line, 10 lines per slide and 10 slides per presentation."],
            ["Shared documents (Google Docs, Miro, MURAL and so on)", "Pre-populate with a general outline or guide."],
            ["", "Consider using chat, polls, screen sharing and other interactive tools."],
            ["", "Be playful! Use memes, music, stories and activities to raise spirits and build connection."],
          ]}
        />
        <Tips heading="Accessibility features" items={[["Auto-generated captions", "Turn them on for those who may require or benefit from screen reading."]]} />
        <Tips
          heading="Sharing"
          items={[
            ["", "Share any relevant content and resources with session participants directly."],
            ["", "Consider recording your session if appropriate."],
            ["", "Submit your content and recordings to share with Limicon members."],
          ]}
        />
      </Section>

      <Section title="Etiquette">
        <Tips
          heading="Preparation"
          items={[
            ["Links and materials", "Have any links or information you plan to share in the chat ready to copy and paste."],
            ["Arrive early", "Arrive 10 minutes early to make sure the technology works and you have time to address any issues."],
          ]}
        />
        <Tips
          heading="Orientation"
          items={[
            ["Greeting", "Greet your participants as they arrive; small talk can help break the ice."],
            ["Privacy reminder", "Remind participants of the session's privacy level: public, Limicon members, session participants only, or unrecorded."],
            ["AI disclosure", "Tell participants about any AI note-takers."],
          ]}
        />
        <Tips
          heading="Framing"
          items={[
            ["Expectations", "Set your expectations: camera use; muting when not speaking; use of chat, emojis and hand-raising, and so on."],
            ["Session outline", "Give a general outline of the session."],
            ["Questions and discussion", "Say when questions and discussion should happen: openly, or when prompted at the end."],
          ]}
        />
        <Tips
          heading="Connection"
          items={[
            ["Introductions", "Introduce yourself, and use the chat to ask where people are from."],
            ["Grounding exercise", "Begin with a breathing or grounding exercise."],
          ]}
        />
        <Tips
          heading="Closure"
          items={[
            ["Key takeaways", "Summarize key takeaways, or have participants share one takeaway each."],
            ["Gratitude", "Thank participants for attending your session."],
          ]}
        />
      </Section>

      <Section title="Addressing tensions">
        <Tips
          heading="Minor disruptions"
          items={[
            ["Background noise", "If there is disruptive background noise, first ask participants to mute themselves, then offer to mute them if needed."],
            ["Staying on track", "If the session goes too far off track, remind the group you want to respect everyone's time and deliver the planned content."],
            ["Flexibility", "Be flexible. Let go of the ego's attachment to rigid plans and control to leave space for new ideas and energy to emerge."],
          ]}
        />
        <Tips
          heading="Defusing escalation"
          items={[
            ["Validation", "Validate all participants' feelings in a positive way, for example: \"I can see you are very passionate about…\""],
            ["Non-judgment", "Stay grounded in non-judgmental observation."],
            ["Respectful disagreement", "Without singling anyone out, remind participants that respectful disagreements are opportunities to understand, learn and grow."],
            ["Empathetic listening", "Guide conversation away from judgment or blame and toward empathetic listening and understanding."],
            ["Clear boundaries", "Give a clear boundary that disrespect of others will not be tolerated in your session or at Limicon."],
          ]}
        />
        <p>
          Please <a className="underline" href={CONTACT}>contact the organizing team</a> with any
          concerns so that we can monitor and follow up as needed.
        </p>
        <p className="font-semibold">
          Have a wonderful session fostering collaboration, creativity and meaningful participation
          from all Limicon members!
        </p>
      </Section>
    </div>
  );
}
