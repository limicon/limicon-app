/**
 * Who may open the Members area. An account alone opens nothing: a ticket for the current
 * edition does, and so does any admin permission (admins have full access by default).
 */
export type MembershipStatus = "member" | "needs-ticket" | "signed-out";

export type Membership = {
  status: MembershipStatus;
  /** The current edition's year, for messages such as "a Limicon 2027 ticket". */
  editionYear: number | null;
};

export function membershipStatus(facts: {
  signedIn: boolean;
  hasTicket: boolean;
  isAdmin: boolean;
}): MembershipStatus {
  if (!facts.signedIn) return "signed-out";
  return facts.hasTicket || facts.isAdmin ? "member" : "needs-ticket";
}
