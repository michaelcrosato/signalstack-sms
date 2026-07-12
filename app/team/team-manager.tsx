"use client";

import { useState, type FormEvent } from "react";

const teamRoles = ["OWNER", "ADMIN", "MEMBER"] as const;
type TeamRole = (typeof teamRoles)[number];

type TeamMemberView = Readonly<{
  membershipId: string;
  orgId: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: TeamRole;
  status: "ACTIVE" | "SUSPENDED";
  userDisabled: boolean;
  createdAt: string;
  updatedAt: string;
}>;

type TeamInviteView = Readonly<{
  inviteId: string;
  orgId: string;
  email: string;
  role: TeamRole;
  issuedByUserId: string | null;
  expiresAt: string;
  createdAt: string;
}>;

type TeamRosterView = Readonly<{
  members: readonly TeamMemberView[];
  pendingInvites: readonly TeamInviteView[];
}>;

type CreatedInviteLink = Readonly<{
  path: string;
  email: string;
  role: TeamRole;
  copied: boolean;
}>;

export function TeamManager({
  actorRole,
  canManage,
  currentUserId,
  initialRoster
}: Readonly<{
  actorRole: TeamRole;
  canManage: boolean;
  currentUserId: string;
  initialRoster: TeamRosterView;
}>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<CreatedInviteLink | null>(null);
  const grantableRoles =
    actorRole === "OWNER" ? teamRoles : teamRoles.filter((role) => role !== "OWNER");

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatedInvite(null);
    const form = new FormData(event.currentTarget);
    await runMutation("invite", async () => {
      const response = await jsonRequest("/api/auth/team/invites", "POST", {
        email: form.get("email"),
        role: form.get("role"),
        expiresInHours: Number(form.get("expiresInHours"))
      });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
      const body = (await response.json()) as {
        acceptPath?: string;
        invite?: { email?: string; role?: TeamRole };
      };
      if (
        !body.acceptPath?.startsWith("/invite#token=") ||
        typeof body.invite?.email !== "string" ||
        !body.invite.role ||
        !teamRoles.includes(body.invite.role)
      ) {
        throw new Error("Invitation was created without a usable acceptance link.");
      }
      setCreatedInvite({
        path: body.acceptPath,
        email: body.invite.email,
        role: body.invite.role,
        copied: false
      });
    }, false);
  }

  async function copyCreatedInvite() {
    if (!createdInvite) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${createdInvite.path}`);
      setCreatedInvite({ ...createdInvite, copied: true });
    } catch {
      setError("Clipboard access was blocked. Copy the visible link manually.");
    }
  }

  async function memberMutation(userId: string, body: unknown) {
    await runMutation(`member-${userId}`, async () => {
      const response = await jsonRequest(`/api/auth/team/members/${encodeURIComponent(userId)}`, "PATCH", body);
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
    });
  }

  async function deleteResource(path: string, busyKey: string, confirmation: string) {
    if (!window.confirm(confirmation)) {
      return;
    }
    await runMutation(busyKey, async () => {
      const response = await fetch(path, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
    });
  }

  async function runMutation(key: string, operation: () => Promise<void>, reload = true) {
    setBusy(key);
    setError(null);
    try {
      await operation();
      if (reload) {
        window.location.reload();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Team operation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {canManage ? (
        <section className="space-y-4 rounded border border-slate-200 bg-white p-5" aria-labelledby="invite-heading">
          <h2 className="text-xl font-semibold text-slate-950" id="invite-heading">Invite a teammate</h2>
          <form className="grid gap-4 md:grid-cols-[1fr_10rem_9rem_auto] md:items-end" onSubmit={invite}>
            <label className="space-y-1 text-sm font-medium text-slate-800">
              <span>Email</span>
              <input className="w-full rounded border border-slate-300 px-3 py-2" maxLength={254} name="email" required type="email" />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-800">
              <span>Role</span>
              <select className="w-full rounded border border-slate-300 px-3 py-2" defaultValue="MEMBER" name="role">
                {grantableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-800">
              <span>Expires (hours)</span>
              <input className="w-full rounded border border-slate-300 px-3 py-2" defaultValue={72} max={720} min={1} name="expiresInHours" required type="number" />
            </label>
            <button className="rounded bg-teal-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={busy !== null} type="submit">
              {busy === "invite" ? "Creating…" : "Create invite"}
            </button>
          </form>
          {createdInvite ? (
            <div className="rounded border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950" role="status">
              <p className="font-semibold">One-time invitation link</p>
              <p className="mt-1 text-xs">
                Target: {createdInvite.email} · {createdInvite.role}
              </p>
              <code className="mt-2 block break-all">{`${windowOrigin()}${createdInvite.path}`}</code>
              <button
                className="mt-3 rounded border border-teal-700 px-3 py-2 font-semibold text-teal-800"
                onClick={copyCreatedInvite}
                type="button"
              >
                {createdInvite.copied ? "Copied for this target" : "Copy this target's link"}
              </button>
              <p className="mt-2 text-xs">The raw token is not stored or shown again.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}

      <section className="space-y-3" aria-labelledby="members-heading">
        <h2 className="text-xl font-semibold text-slate-950" id="members-heading">Members</h2>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr><th className="p-3">Person</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {initialRoster.members.map((member) => (
                <tr className="border-b border-slate-100 last:border-0" key={member.membershipId}>
                  <td className="p-3"><span className="font-medium text-slate-950">{member.displayName ?? member.email}</span><span className="block text-xs text-slate-500">{member.email}{member.userId === currentUserId ? " · You" : ""}</span></td>
                  <td className="p-3">
                    {canManage && (actorRole === "OWNER" || member.role !== "OWNER") ? (
                      <select
                        aria-label={`Role for ${member.email}`}
                        className="rounded border border-slate-300 px-2 py-1.5"
                        defaultValue={member.role}
                        disabled={busy !== null || member.userDisabled}
                        onChange={(event) => memberMutation(member.userId, { role: event.target.value })}
                      >
                        {grantableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    ) : member.role}
                  </td>
                  <td className="p-3">{member.userDisabled ? "DISABLED" : member.status}</td>
                  <td className="p-3">
                    {canManage && (actorRole === "OWNER" || member.role !== "OWNER") ? (
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded border border-slate-300 px-2 py-1.5" disabled={busy !== null || member.userDisabled} onClick={() => memberMutation(member.userId, { suspended: member.status === "ACTIVE" })} type="button">
                          {member.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </button>
                        <button className="rounded border border-red-300 px-2 py-1.5 text-red-700" disabled={busy !== null} onClick={() => deleteResource(`/api/auth/team/members/${encodeURIComponent(member.userId)}`, `member-${member.userId}`, `Remove ${member.email} from this organization?`)} type="button">Remove</button>
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="invites-heading">
        <h2 className="text-xl font-semibold text-slate-950" id="invites-heading">Pending invitations</h2>
        {initialRoster.pendingInvites.length === 0 ? <p className="text-sm text-slate-600">No pending invitations.</p> : (
          <ul className="space-y-2">
            {initialRoster.pendingInvites.map((invite) => (
              <li className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white p-4" key={invite.inviteId}>
                <div><p className="font-medium text-slate-950">{invite.email}</p><p className="text-xs text-slate-500">{invite.role} · expires {new Date(invite.expiresAt).toLocaleString()}</p></div>
                {canManage && (actorRole === "OWNER" || invite.role !== "OWNER") ? <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700" disabled={busy !== null} onClick={() => deleteResource(`/api/auth/team/invites/${encodeURIComponent(invite.inviteId)}`, `invite-${invite.inviteId}`, `Revoke the invitation for ${invite.email}?`)} type="button">Revoke</button> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function jsonRequest(path: string, method: "POST" | "PATCH", body: unknown) {
  return fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Team operation failed.";
}

function windowOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}
