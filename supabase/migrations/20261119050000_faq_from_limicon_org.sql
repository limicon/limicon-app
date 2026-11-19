-- The FAQ as limicon.org published it, so the public /faq page starts with the same questions.
-- Admins edit them in the console from here. They go after any entries admins have already added,
-- skipping questions already on the list.
insert into public.faq_entries (question, answer, published, sort_order)
select v.question, v.answer, v.sort_order <> 11,
       (select coalesce(max(sort_order), -1) + 1 from public.faq_entries) + v.sort_order
from (values
  (0, $q$What is Limicon?$q$, $a$Limicon is a four-week, mostly online, "fan-made" open space convention dedicated to strengthening the growing ecosystem of communities spawned from the liminal web.

The three main goals of Limicon are to:
1. build connection and trust between members of the emerging field;
2. create engaging spaces for individual development and practice; and
3. nurture the field as a whole.$a$),

  (1, $q$Seems messy/fuzzy — does this whole thing really... work?$q$, $a$People seemed to have a great time the last two years! The nature of "success" will of course vary person to person depending on their hopes. We invite all members to take an active role in satisfying their desires, and no matter what happens, to keep an open mindset of learning and experimentation.$a$),

  (2, $q$Can I bring a friend?$q$, $a$For some individual Limicon sessions you will be able to invite a guest (see schedule for details). Guests who want to attend more than a single session are encouraged to purchase their own ticket and join the network map!$a$),

  (3, $q$How can I propose a session?$q$, $a$Upon registration, you will receive an email detailing the different options you have for proposing an event. Find more details on the Co-Create page: https://www.limicon.org/cocreate$a$),

  (4, $q$How is my personal data used?$q$, $a$Read the current Privacy Policy — in short, your data is accessible to this year's Limicon members, but not public. (This is a change from last year, where the network map and Miro were publicly accessible.) All ticket purchasers have consented to the privacy policy, and we rely on the mutual responsibility of all members and guests to safeguard each other's personal information.$a$),

  (5, $q$Will the sessions be recorded?$q$, $a$Session hosts choose an appropriate privacy level for their session. There are four privacy levels: No recording, shared only with session attendees, shared with all Limicon 2026 attendees (default), or shared publicly. This information can be found in the description for that particular session.$a$),

  (6, $q$How can I get involved?$q$, $a$There are many ways to get involved with Limicon. Join the co-creation calls (https://www.limicon.org/cocreate) or contact the organizing team (https://www.limicon.org/contact) to learn more about opportunities.$a$),

  (8, $q$Where does the money from ticket sales go?$q$, $a$First, we need to cover expenses. We are doing our best to keep these costs down - most hard costs are technology platforms like Zoom, Miro and the hosting for this website.

Second, some of the money goes towards compensating the people who are logistically and energetically organizing the space. We will conduct a "Happy Money Story" session towards the end of Limicon, an allocation/distribution practice open to visibility and participation. Limicon is a non-profit entity and nobody's extracting riches - in fact, sustainability/viability over time is still an open question.$a$),

  (9, $q$Can accessibility accommodations be made during sessions?$q$, $a$Every session host has been provided with a guide that includes a request to turn auto-captioning features on. Visit our accessibility page for accessibility features you can adjust to improve your experience: https://www.limicon.org/accessibility$a$),

  (10, $q$I heard clothing is optional. Is that true?$q$, $a$We ask that video-visible torsos/bodies are more-or-less conventionally covered for the sake of creating a safe and fluid social atmosphere. But anything below the camera is fair game, as attendees of "Submerge 2024 - Conversations from a Bubble Bath" can attest. 🛀$a$),

  -- Unanswered until calendar feeds are built; the draft keeps it on the console's list.
  (11, $q$Why can't I access the Limicon 2026 Calendar?$q$, $a$To be written.$a$),

  (12, $q$I don't see my purchase on my credit card statement.$q$, $a$Your transaction for Limicon will appear as "Transdisciplinary Lead East York" on your credit card statement.$a$)
) as v (sort_order, question, answer)
where not exists (select 1 from public.faq_entries f where f.question = v.question);
