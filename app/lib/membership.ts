/**
 * Who may open the Members area. An account alone opens nothing: a ticket for the current
 * edition does, and so does holding any role (admins and helpers such as a Bookkeeper). An
 * account an admin has deactivated opens nothing, whatever it holds (MSG-4).
 */
export type MembershipStatus = "member" | "needs-ticket" | "signed-out" | "deactivated";

export type Membership = {
  status: MembershipStatus;
  /** The current edition (the one with the latest year), or null before any exists. */
  edition: { id: number; year: number; firstDay: string | null; lastDay: string | null } | null;
  /** Holds an admin permission and isn't deactivated. */
  isAdmin: boolean;
};

export function membershipStatus(facts: {
  signedIn: boolean;
  hasTicket: boolean;
  isAdmin: boolean;
  deactivated?: boolean;
}): MembershipStatus {
  if (!facts.signedIn) return "signed-out";
  if (facts.deactivated) return "deactivated";
  return facts.hasTicket || facts.isAdmin ? "member" : "needs-ticket";
}
