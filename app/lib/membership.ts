/**
 * Who may open the Members area. An account alone opens nothing: a ticket for the current
 * edition does, and so does any admin permission (admins have full access by default).
 */
export type MembershipStatus = "member" | "needs-ticket" | "signed-out";

export type Membership = {
  status: MembershipStatus;
  /** The current edition (the one with the latest year), or null before any exists. */
  edition: { id: number; year: number; firstDay: string | null; lastDay: string | null } | null;
  isAdmin: boolean;
};

export function membershipStatus(facts: {
  signedIn: boolean;
  hasTicket: boolean;
  isAdmin: boolean;
}): MembershipStatus {
  if (!facts.signedIn) return "signed-out";
  return facts.hasTicket || facts.isAdmin ? "member" : "needs-ticket";
}
