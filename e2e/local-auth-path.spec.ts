import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import {
  localSessionCookieName,
  productionSessionCookieName
} from "@/lib/auth/session-cookie";
import { hashLocalSessionToken, hashOpaqueToken } from "@/lib/auth/crypto";
import { createPrismaOperatorPasswordResetService } from "@/lib/auth/operator-password-reset";
import {
  cleanupLocalAuthE2eFixtures,
  disconnectLocalAuthE2eDatabase,
  localAuthE2eOwnerPrisma,
  localAuthE2eFixture as fixture,
  requireLocalAuthE2eProfile
} from "./local-auth-fixtures";

test.skip(
  process.env.RUN_LOCAL_AUTH_E2E !== "true",
  "Set RUN_LOCAL_AUTH_E2E=true with the isolated local-auth profile to run this proof."
);
test.use({ trace: "off", screenshot: "off", video: "off" });

test("first-owner, organization, invitation, role, and revocation path", async ({
  baseURL,
  browser,
  context,
  page
}) => {
  test.setTimeout(240_000);
  const profile = requireLocalAuthE2eProfile();
  const prisma = localAuthE2eOwnerPrisma();
  const expectedBaseURL = requireBaseURL(baseURL);
  const secureCookie = expectsProductionCookie();
  const ownerBrowserLog = collectBrowserLog(page);
  let memberContext: BrowserContext | undefined;
  let inviteToken: string | undefined;
  let resetToken: string | undefined;
  const sessionTokens: string[] = [];
  const memberResetPassword = `Reset-${createHash("sha256")
    .update("signalstack-e2e-reset\0", "utf8")
    .update(profile.memberPassword, "utf8")
    .digest("base64url")}!`;

  await cleanupLocalAuthE2eFixtures(profile.throttleSecret);
  const unrelatedCredentialCount = await prisma.localCredential.count();
  if (unrelatedCredentialCount !== 0) {
    throw new Error(
      "Local-auth E2E requires zero LocalCredential rows after exact fixture cleanup; no shared credential rows were deleted."
    );
  }

  try {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "Create the first owner" })).toBeVisible();

    await page.getByLabel("Bootstrap token").fill(profile.bootstrapToken);
    await page.getByLabel("Owner name").fill(fixture.ownerName);
    await page.getByLabel("Owner email").fill(fixture.ownerEmail);
    await page.getByLabel("Password", { exact: true }).fill(profile.ownerPassword);
    await page.getByLabel("Organization name").fill(fixture.primaryOrganizationName);
    await page.getByLabel("Organization slug").fill(fixture.primaryOrganizationSlug);
    await page.getByLabel("Organization timezone").fill(fixture.timezone);

    const setupResponsePromise = authResponse(page, "/api/auth/setup", "POST");
    await page.getByRole("button", { name: "Create owner and organization" }).click();
    const setupResponse = await setupResponsePromise;
    expect(setupResponse.status()).toBe(201);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Product Dashboard", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        `${fixture.primaryOrganizationName} · ${fixture.ownerEmail} · OWNER`,
        { exact: true }
      )
    ).toBeVisible();
    assertAuthenticatedDocumentCacheProtection(await page.reload(), "/dashboard");

    const setupSessionToken = await requireSessionCookie(context, secureCookie);
    sessionTokens.push(setupSessionToken);
    const dashboardHtml = await page.content();
    assertSensitiveMaterialAbsent(dashboardHtml, [
      profile.bootstrapToken,
      profile.ownerPassword,
      setupSessionToken
    ]);
    expect(
      await prisma.authSession.count({
        where: {
          tokenHash: hashLocalSessionToken(
            setupSessionToken,
            profile.environment.AUTH_SESSION_SECRET
          ),
          revokedAt: null
        }
      })
    ).toBe(1);
    expect(await prisma.authSession.count({ where: { tokenHash: setupSessionToken } })).toBe(0);

    const currentSessionResponse = await browserFetch(page, "/api/auth/session");
    expect(currentSessionResponse.status).toBe(200);
    const currentSessionBody = currentSessionResponse.body;
    assertSensitiveMaterialAbsent(currentSessionBody, [
      profile.bootstrapToken,
      profile.ownerPassword,
      setupSessionToken
    ]);
    assertNoOpaqueSessionInBody(currentSessionBody);
    expect(JSON.parse(currentSessionBody)).toMatchObject({
      session: {
        user: { email: fixture.ownerEmail },
        organization: { slug: fixture.primaryOrganizationSlug },
        membership: { role: "OWNER" }
      }
    });

    await page.goto("/logout");
    const logoutResponsePromise = authResponse(page, "/api/auth/logout", "POST");
    await page.getByRole("button", { name: "Sign out" }).click();
    expect((await logoutResponsePromise).status()).toBe(204);
    await expect(page).toHaveURL(/\/login$/);
    expect(await hasSessionCookie(context, secureCookie)).toBe(false);
    expect(
      await prisma.authSession.count({
        where: {
          tokenHash: hashLocalSessionToken(
            setupSessionToken,
            profile.environment.AUTH_SESSION_SECRET
          ),
          revokedAt: { not: null }
        }
      })
    ).toBe(1);

    await page.goto("/organizations");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Forganizations$/);
    await page.getByLabel("Email").fill(fixture.ownerEmail);
    await page.getByLabel("Password").fill(profile.ownerPassword);
    const loginResponsePromise = authResponse(page, "/api/auth/login", "POST");
    await page.getByRole("button", { name: "Sign in" }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    await expect(page).toHaveURL(/\/organizations$/);
    await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();

    const ownerSessionToken = await requireSessionCookie(context, secureCookie);
    if (ownerSessionToken === setupSessionToken) {
      throw new Error("Logout and login did not rotate the opaque browser session.");
    }
    sessionTokens.push(ownerSessionToken);

    await page.getByLabel("Name", { exact: true }).fill(fixture.secondaryOrganizationName);
    await page.getByLabel("Slug", { exact: true }).fill(fixture.secondaryOrganizationSlug);
    await page.getByLabel("Timezone", { exact: true }).fill(fixture.timezone);
    const createOrganizationResponsePromise = authResponse(
      page,
      "/api/auth/organizations",
      "POST"
    );
    await page.getByRole("button", { name: "Create organization" }).click();
    const createOrganizationResponse = await createOrganizationResponsePromise;
    expect(createOrganizationResponse.status()).toBe(201);

    const secondaryWorkspace = page
      .getByRole("listitem")
      .filter({ hasText: fixture.secondaryOrganizationName });
    await expect(secondaryWorkspace).toBeVisible();
    const selectOrganizationResponsePromise = authResponse(
      page,
      "/api/auth/organizations/select",
      "POST"
    );
    await secondaryWorkspace.getByRole("button", { name: "Switch" }).click();
    const selectOrganizationResponse = await selectOrganizationResponsePromise;
    expect(selectOrganizationResponse.status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByText(
        `${fixture.secondaryOrganizationName} · ${fixture.ownerEmail} · OWNER`,
        { exact: true }
      )
    ).toBeVisible();
    if ((await requireSessionCookie(context, secureCookie)) !== ownerSessionToken) {
      throw new Error("Organization selection unexpectedly replaced the browser session bearer.");
    }

    const teamDocumentResponse = await page.goto("/team");
    assertAuthenticatedDocumentCacheProtection(teamDocumentResponse, "/team");
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
    const inviteSection = page
      .getByRole("heading", { name: "Invite a teammate" })
      .locator("..");
    await inviteSection.getByLabel("Email").fill(fixture.memberEmail);
    await inviteSection.getByLabel("Role").selectOption("MEMBER");
    const inviteResponsePromise = authResponse(page, "/api/auth/team/invites", "POST");
    await page.getByRole("button", { name: "Create invite" }).click();
    const inviteResponse = await inviteResponsePromise;
    expect(inviteResponse.status()).toBe(201);
    const inviteResponseBody = await inviteResponse.text();
    assertSensitiveMaterialAbsent(inviteResponseBody, [
      profile.bootstrapToken,
      profile.ownerPassword,
      ownerSessionToken
    ]);

    const inviteStatus = page
      .getByRole("status")
      .filter({ hasText: "One-time invitation link" });
    await expect(inviteStatus).toBeVisible();
    const inviteAbsoluteURL = await inviteStatus.locator("code").textContent();
    const parsedInvite = parseInviteURL(inviteAbsoluteURL, expectedBaseURL);
    inviteToken = parsedInvite.token;
    const invitePayload = JSON.parse(inviteResponseBody) as { acceptPath?: string };
    if (invitePayload.acceptPath !== parsedInvite.path) {
      throw new Error("The visible invitation fragment did not match the created invitation.");
    }
    expect(
      await prisma.authToken.count({
        where: { tokenHash: hashOpaqueToken(inviteToken), consumedAt: null, revokedAt: null }
      })
    ).toBe(1);
    expect(await prisma.authToken.count({ where: { tokenHash: inviteToken } })).toBe(0);

    const expectedPort = Number(new URL(expectedBaseURL).port);
    memberContext = await browser.newContext({
      baseURL: expectedBaseURL,
      extraHTTPHeaders: {
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-host": `127.0.0.1:${expectedPort}`,
        "x-forwarded-proto": "http"
      }
    });
    // Seed the real fragment inside the browser before React hydration so Playwright never receives a
    // secret-bearing navigation URL that it could print on failure. The invite component still reads
    // and scrubs the fragment through the same browser path as a copied one-time link.
    await memberContext.addInitScript((token) => {
      if (window.location.pathname === "/invite" && window.location.hash === "") {
        window.history.replaceState(
          null,
          "",
          `/invite#token=${encodeURIComponent(token)}`
        );
      }
    }, inviteToken);
    const memberPage = await memberContext.newPage();
    const memberBrowserLog = collectBrowserLog(memberPage);
    await memberPage.goto("/invite");
    await expect(memberPage.getByRole("heading", { name: "Accept invitation" })).toBeVisible();
    await expect.poll(() => new URL(memberPage.url()).hash === "").toBe(true);
    assertSensitiveMaterialAbsent(await memberPage.content(), [
      profile.bootstrapToken,
      profile.ownerPassword,
      inviteToken,
      ...sessionTokens
    ]);

    const createInvitedAccountForm = memberPage
      .getByRole("button", { name: "Create account and accept" })
      .locator("..");
    await createInvitedAccountForm.getByLabel("Display name").fill(fixture.memberName);
    await createInvitedAccountForm.getByLabel("Password").fill(profile.memberPassword);
    const acceptResponsePromise = authResponse(
      memberPage,
      "/api/auth/team/invites/accept",
      "POST"
    );
    await createInvitedAccountForm
      .getByRole("button", { name: "Create account and accept" })
      .click();
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.status()).toBe(200);
    await expect(memberPage).toHaveURL(/\/team$/);

    const memberSessionToken = await requireSessionCookie(memberContext, secureCookie);
    sessionTokens.push(memberSessionToken);
    await expect(
      memberPage.getByText(
        `${fixture.secondaryOrganizationName} · ${fixture.memberEmail} · MEMBER`,
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      memberPage.getByRole("heading", { name: "Team access is restricted" })
    ).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "Invite a teammate" })).toHaveCount(0);

    const issueOperatorReset = await createPrismaOperatorPasswordResetService(prisma);
    const operatorReset = await issueOperatorReset({
      email: fixture.memberEmail,
      organizationSlug: fixture.secondaryOrganizationSlug
    });
    resetToken = operatorReset.token;
    expect(
      await prisma.authToken.count({
        where: { tokenHash: hashOpaqueToken(resetToken), consumedAt: null, revokedAt: null }
      })
    ).toBe(1);
    expect(await prisma.authToken.count({ where: { tokenHash: resetToken } })).toBe(0);

    await memberContext.addInitScript((token) => {
      if (window.location.pathname === "/reset" && window.location.hash === "") {
        window.history.replaceState(
          null,
          "",
          `/reset#token=${encodeURIComponent(token)}`
        );
      }
    }, resetToken);
    await memberPage.goto("/reset");
    await expect(memberPage.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await expect.poll(() => new URL(memberPage.url()).hash === "").toBe(true);
    await memberPage.getByLabel("New password", { exact: true }).fill(memberResetPassword);
    await memberPage
      .getByLabel("Confirm new password", { exact: true })
      .fill(memberResetPassword);
    const completeResetResponsePromise = authResponse(
      memberPage,
      "/api/auth/password-resets/complete",
      "POST"
    );
    await memberPage.getByRole("button", { name: "Reset password" }).click();
    expect((await completeResetResponsePromise).status()).toBe(200);
    await expect(memberPage).toHaveURL(/\/login$/);
    expect(await hasSessionCookie(memberContext, secureCookie)).toBe(false);
    expect(
      await prisma.authSession.count({
        where: {
          tokenHash: hashLocalSessionToken(
            memberSessionToken,
            profile.environment.AUTH_SESSION_SECRET
          ),
          revokedAt: { not: null }
        }
      })
    ).toBe(1);

    await memberPage.getByLabel("Email").fill(fixture.memberEmail);
    await memberPage.getByLabel("Password").fill(memberResetPassword);
    const resetLoginResponsePromise = authResponse(memberPage, "/api/auth/login", "POST");
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    expect((await resetLoginResponsePromise).status()).toBe(200);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    const resetMemberSessionToken = await requireSessionCookie(memberContext, secureCookie);
    sessionTokens.push(resetMemberSessionToken);
    if (resetMemberSessionToken === memberSessionToken) {
      throw new Error("Password reset did not rotate the invited member's session bearer.");
    }
    await memberPage.goto("/team");
    await expect(
      memberPage.getByRole("heading", { name: "Team access is restricted" })
    ).toBeVisible();

    const resetMemberSessionHash = hashLocalSessionToken(
      resetMemberSessionToken,
      profile.environment.AUTH_SESSION_SECRET
    );
    const resetMemberSession = await prisma.authSession.findUnique({
      where: { tokenHash: resetMemberSessionHash },
      select: { id: true, createdAt: true, idleExpiresAt: true, revokedAt: true }
    });
    if (!resetMemberSession || resetMemberSession.revokedAt) {
      throw new Error("The post-reset member session was not active before the expiry proof.");
    }
    const forcedIdleExpiry = new Date(resetMemberSession.createdAt.getTime() + 1);
    if (forcedIdleExpiry.getTime() >= Date.now()) {
      throw new Error("The post-reset member session could not be safely backdated.");
    }
    const expiredSession = await prisma.authSession.updateMany({
      where: {
        id: resetMemberSession.id,
        tokenHash: resetMemberSessionHash,
        idleExpiresAt: resetMemberSession.idleExpiresAt,
        revokedAt: null
      },
      data: { idleExpiresAt: forcedIdleExpiry }
    });
    expect(expiredSession.count).toBe(1);

    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/login\?redirectTo=%2Fdashboard$/);
    await expect(memberPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const expiredSessionResponse = await browserFetch(memberPage, "/api/auth/session");
    expect(expiredSessionResponse.status).toBe(401);
    assertSensitiveMaterialAbsent(expiredSessionResponse.body, [
      resetMemberSessionToken,
      memberResetPassword
    ]);
    expect(await hasSessionCookie(memberContext, secureCookie)).toBe(false);

    await memberPage.getByLabel("Email").fill(fixture.memberEmail);
    await memberPage.getByLabel("Password").fill(memberResetPassword);
    const postExpiryLoginResponsePromise = authResponse(memberPage, "/api/auth/login", "POST");
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    expect((await postExpiryLoginResponsePromise).status()).toBe(200);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    const activeMemberSessionToken = await requireSessionCookie(memberContext, secureCookie);
    sessionTokens.push(activeMemberSessionToken);
    if (activeMemberSessionToken === resetMemberSessionToken) {
      throw new Error("Re-authentication after session expiry did not rotate the member bearer.");
    }
    await memberPage.goto("/team");
    await expect(
      memberPage.getByRole("heading", { name: "Team access is restricted" })
    ).toBeVisible();

    await page.reload();
    const memberRow = page.getByRole("row").filter({ hasText: fixture.memberEmail });
    await expect(memberRow).toBeVisible();
    const promoteResponsePromise = memberMutationResponse(page);
    await memberRow.getByLabel(`Role for ${fixture.memberEmail}`).selectOption("OWNER");
    expect((await promoteResponsePromise).status()).toBe(200);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: fixture.memberEmail })
        .getByLabel(`Role for ${fixture.memberEmail}`)
    ).toHaveValue("OWNER");

    await memberPage.reload();
    await expect(
      memberPage.getByText(
        `${fixture.secondaryOrganizationName} · ${fixture.memberEmail} · OWNER`,
        { exact: true }
      )
    ).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "Invite a teammate" })).toBeVisible();

    const suspendMemberResponsePromise = memberMutationResponse(page);
    await page
      .getByRole("row")
      .filter({ hasText: fixture.memberEmail })
      .getByRole("button", { name: "Suspend" })
      .click();
    expect((await suspendMemberResponsePromise).status()).toBe(200);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: fixture.memberEmail })
        .getByRole("cell", { name: "SUSPENDED" })
    ).toBeVisible();

    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/login\?redirectTo=%2Fdashboard$/);
    await expect(memberPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(
      await prisma.authSession.count({
        where: {
          tokenHash: hashLocalSessionToken(
            activeMemberSessionToken,
            profile.environment.AUTH_SESSION_SECRET
          ),
          revokedAt: { not: null }
        }
      })
    ).toBe(1);

    const finalOwnerResponsePromise = memberMutationResponse(page);
    await page
      .getByRole("row")
      .filter({ hasText: fixture.ownerEmail })
      .getByRole("button", { name: "Suspend" })
      .click();
    expect((await finalOwnerResponsePromise).status()).toBe(409);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The organization must retain an active owner." })
    ).toHaveText("The organization must retain an active owner.");

    await page.reload();
    const finalOwnerMembership = await prisma.membership.findFirst({
      where: {
        org: { slug: fixture.secondaryOrganizationSlug },
        user: { normalizedEmail: fixture.ownerEmail }
      },
      select: { role: true, status: true }
    });
    expect(finalOwnerMembership).toEqual({ role: "OWNER", status: "ACTIVE" });
    expect(await prisma.localCredential.count()).toBe(2);

    const allSensitiveMaterial = [
      profile.bootstrapToken,
      profile.ownerPassword,
      profile.memberPassword,
      memberResetPassword,
      inviteToken,
      resetToken,
      ...sessionTokens
    ];
    assertSensitiveMaterialAbsent(await page.content(), allSensitiveMaterial);
    assertSensitiveMaterialAbsent(await memberPage.content(), allSensitiveMaterial);
    assertSensitiveMaterialAbsent(ownerBrowserLog.join("\n"), allSensitiveMaterial);
    assertSensitiveMaterialAbsent(memberBrowserLog.join("\n"), allSensitiveMaterial);
    expect(await prisma.authSession.count({ where: { tokenHash: { in: sessionTokens } } })).toBe(0);
  } finally {
    try {
      await memberContext?.close();
    } finally {
      try {
        await cleanupLocalAuthE2eFixtures(profile.throttleSecret);
      } finally {
        await disconnectLocalAuthE2eDatabase();
      }
    }
  }
});

function authResponse(page: Page, pathname: string, method: string): Promise<Response> {
  return page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === pathname && request.method() === method;
  });
}

function memberMutationResponse(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    const request = response.request();
    return (
      new URL(response.url()).pathname.startsWith("/api/auth/team/members/") &&
      request.method() === "PATCH"
    );
  });
}

function collectBrowserLog(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  page.on("pageerror", (error) => messages.push(error.message));
  return messages;
}

async function browserFetch(
  page: Page,
  path: string
): Promise<Readonly<{ status: number; body: string }>> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: "same-origin" });
    return { status: response.status, body: await response.text() };
  }, path);
}

function requireBaseURL(value: string | undefined): string {
  if (!value) {
    throw new Error("The local-auth Playwright config must provide a base URL.");
  }
  return value;
}

function expectsProductionCookie(): boolean {
  return (
    process.env.LOCAL_AUTH_E2E_SERVER_MODE === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.APP_ENV === "prod"
  );
}

async function requireSessionCookie(
  context: BrowserContext,
  secure: boolean
): Promise<string> {
  const expectedName = secure ? productionSessionCookieName : localSessionCookieName;
  const matches = (await context.cookies()).filter((cookie) => cookie.name === expectedName);
  if (matches.length !== 1) {
    throw new Error("The browser did not retain exactly one environment-appropriate session cookie.");
  }
  const cookie = matches[0]!;
  if (!/^ss_session_[A-Za-z0-9_-]{43}$/.test(cookie.value)) {
    throw new Error("The browser session cookie did not contain a bounded opaque bearer.");
  }
  if (
    !cookie.httpOnly ||
    cookie.sameSite !== "Lax" ||
    cookie.path !== "/" ||
    cookie.secure !== secure
  ) {
    throw new Error("The browser session cookie attributes did not match the runtime profile.");
  }
  return cookie.value;
}

async function hasSessionCookie(context: BrowserContext, secure: boolean): Promise<boolean> {
  const expectedName = secure ? productionSessionCookieName : localSessionCookieName;
  return (await context.cookies()).some((cookie) => cookie.name === expectedName);
}

function parseInviteURL(
  value: string | null,
  expectedBaseURL: string
): Readonly<{ path: string; token: string }> {
  let parsed: URL;
  try {
    parsed = new URL(value ?? "");
  } catch {
    throw new Error("The one-time invitation URL was unavailable.");
  }
  const token = new URLSearchParams(parsed.hash.slice(1)).get("token");
  if (
    parsed.origin !== new URL(expectedBaseURL).origin ||
    parsed.pathname !== "/invite" ||
    !token ||
    !/^ss_invite_[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    throw new Error("The one-time invitation URL had an invalid local fragment shape.");
  }
  return Object.freeze({
    path: `${parsed.pathname}${parsed.hash}`,
    token
  });
}

function assertSensitiveMaterialAbsent(surface: string, secrets: readonly string[]): void {
  const reflectedIndex = secrets.findIndex(
    (secret) => secret.length > 0 && surface.includes(secret)
  );
  if (reflectedIndex >= 0) {
    throw new Error(
      `Sensitive local-auth fixture material at assertion index ${reflectedIndex} was reflected in a browser-visible surface.`
    );
  }
}

function assertNoOpaqueSessionInBody(surface: string): void {
  if (/ss_session_[A-Za-z0-9_-]{43}/.test(surface)) {
    throw new Error("An opaque session bearer was returned in a response body.");
  }
}

function assertAuthenticatedDocumentCacheProtection(
  response: Response | null,
  expectedPathname: string
): void {
  if (
    !response ||
    response.status() !== 200 ||
    response.request().resourceType() !== "document" ||
    new URL(response.url()).pathname !== expectedPathname
  ) {
    throw new Error(`The authenticated ${expectedPathname} document response was unavailable.`);
  }
  const cacheControl = response.headers()["cache-control"]?.toLowerCase() ?? "";
  const directives = cacheControl.split(",").map((directive) => directive.trim());
  if (!directives.some((directive) => directive === "no-store" || directive === "private")) {
    throw new Error(
      `The authenticated ${expectedPathname} document was not protected from shared caching.`
    );
  }
}
