import { Link } from "react-router";

/**
 * The Privacy Policy and Code of Conduct (PUB-1), as last updated on 5 February 2026. Members
 * agree to both when they register, so a change here changes what new registrants agree to.
 */

const link = "underline";

function Updated() {
  return <p className="text-sm opacity-80">Last updated 5 February 2026</p>;
}

export function PrivacyPolicy() {
  return (
    <div className="grid max-w-[68ch] gap-4 leading-relaxed">
      <p>
        Limicon is run by humans, who are not lawyers, so{" "}
        <a href="mailto:team@limicon.org" className={link}>
          contact the Limicon Organizing Team
        </a>{" "}
        if you have unaddressed needs or questions about this policy.
      </p>
      <p>
        The default Limicon privacy boundary is that all sessions, activities, and related data are
        accessible and available for the personal noncommercial use of Limicon participants, and not
        available to the public. The Limicon Network Map, shared Limicon Miro board, group-level
        content in all Limicon Hylo groups, the official unlisted YouTube playlist, and any other
        relevant data/platforms are governed by this default.
      </p>
      <p>
        However, session hosts have wide latitude to designate their session (particularly audio or
        video recordings) as adhering to a range of privacy levels:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>No recording</li>
        <li>Recording available only to session participants (plus special cases for specific individuals)</li>
        <li>Recording available to Limicon participants (default)</li>
        <li>Recording publicly available</li>
      </ul>
      <p>
        <strong>Confidentiality:</strong> Default to{" "}
        <a href="https://en.wikipedia.org/wiki/Chatham_House_Rule" className={link}>
          Chatham House Rule
        </a>{" "}
        (information is usable; however, do not reveal identities), or else another confidentiality
        policy for a particular session, as specifically designated by the session host(s) at the
        start of the session.
      </p>
      <p>
        The trust and safety of Limicon participants depends on all hosts and participants holding
        the proper privacy boundaries. Please be responsible. Anyone desiring to bring information
        from a more-restrictive to less-restrictive privacy level must obtain written review and
        approval of their content anonymization efforts from The Limicon Organizing Team. Any misuse
        or inappropriate sharing of personal information may be treated as a violation of the{" "}
        <Link to="/conduct" className={link}>
          Limicon Code of Conduct
        </Link>{" "}
        and handled according to its procedures.
      </p>
      <p>
        Limicon sessions are open to attendance by any Limicon participant, though criteria and
        guidelines may be applied as desired by the session host. Sessions may be attended by
        representatives of hosting/participating organizations as necessary for hosting a beneficial
        experience, but Limicon sessions cannot be fully open to the public. Participants may bring a
        guest/friend/family when that is integral to the purpose of a specific session. Guests who
        want to attend more than a single session are encouraged to purchase their own ticket.
      </p>
      <p>
        The use of AI tools in individual sessions will, similar to privacy settings, be at the
        discretion of each individual session organizer. Limicon organizers may use AI tools to help
        foster collective intelligence building and network weaving. Every effort will be made to use
        both the inputs and outputs in responsible and aligned ways.
      </p>
      <Updated />
    </div>
  );
}

export function CodeOfConduct() {
  return (
    <div className="grid max-w-[68ch] gap-4 leading-relaxed">
      <p>
        Limicon events are intended to be inclusive and welcoming for everyone. In particular,
        harassment of participants in any form is not tolerated. Limicon will enforce these
        expectations throughout the event and may take any action they deem appropriate, including
        warning the offender, expulsion from the event with no refund, and banning the participant
        from any future Limicon events.
      </p>
      <p>
        Harassment includes but is not limited to disparaging verbal comments related to gender
        identity and expression, sexual orientation, disability, personal appearance, body size,
        race, ethnicity, age, religion, nationality, or other similar characteristics; deliberate
        intimidation; stalking; sustained disruption of talks or other events; harassing photography
        or recording; inappropriate physical contact; and unwelcome sexual attention.
      </p>
      <p>
        Participants asked to stop any harassing behavior are expected to comply immediately.
        Participants who believe they have been wrongly accused will have an opportunity to share
        their perspective, typically before any decision about further action is made, except in
        cases of egregious harassment. All personal information shared in reports or communications
        will be handled in accordance with the{" "}
        <Link to="/privacy" className={link}>
          Limicon Privacy Policy
        </Link>
        . Limicon will endeavor to be fair in deciding a further course of action but reserves the
        discretion to expel individuals from Limicon events regardless of any disputed facts.
      </p>
      <p>
        All participants are expected to respect the confidentiality of personal information shared
        by others during sessions, in accordance with Limicon’s Privacy Policy.
      </p>
      <p>
        If you are being harassed, notice that someone else is being harassed, or if you need
        immediate help of any kind at this event, please contact the{" "}
        <a href="mailto:team@limicon.org" className={link}>
          Limicon Organizing Team
        </a>
        .
      </p>
      <Updated />
    </div>
  );
}
