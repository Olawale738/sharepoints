import { expect, test } from "@playwright/test";

test("health endpoint reports a connected database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "healthy", database: "connected" });
});

test("protected dashboard redirects visitors to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("registration clearly requires an invitation", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByText(/invitation-only/i)).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

test("people operations and its APIs require authentication", async ({ page, request }) => {
  await page.goto("/dashboard/operations");
  await expect(page).toHaveURL(/\/login/);

  for (const path of ["/api/visitors", "/api/help-desk", "/api/event-ticketing", "/api/policies", "/api/staff"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
  }
});

test("church operation deletion requires an authenticated administrator", async ({ request }) => {
  const response = await request.delete("/api/church/operations", {
    data: {
      entity: "RESOURCE",
      id: "test-resource"
    }
  });
  expect(response.status()).toBe(401);
});

test("AI, CRM, and activity deletion enforce authentication", async ({ request }) => {
  const aiResponse = await request.get("/api/ai-assistant");
  expect(aiResponse.status()).toBe(401);

  const crmResponse = await request.patch("/api/admin/members/not-a-user", {
    data: {
      membershipStatus: "ACTIVE",
      ministryInterests: [],
      skills: []
    }
  });
  expect(crmResponse.status()).toBe(401);

  const activityResponse = await request.delete("/api/workspaces/not-a-workspace/activity");
  expect(activityResponse.status()).toBe(401);
});

test("required forms and sanctions enforce authentication", async ({ page, request }) => {
  await page.goto("/dashboard/compliance");
  await expect(page).toHaveURL(/\/login/);

  const complianceResponse = await request.get("/api/compliance");
  expect(complianceResponse.status()).toBe(401);

  const campaignResponse = await request.post("/api/compliance/campaigns", { data: {} });
  expect(campaignResponse.status()).toBe(401);

  const sanctionResponse = await request.patch("/api/compliance/sanctions/not-a-sanction", {
    data: { reason: "Test" }
  });
  expect(sanctionResponse.status()).toBe(401);
});

test("global church network controls require authentication", async ({ page, request }) => {
  for (const path of [
    "/dashboard/admin/global",
    "/dashboard/emergency",
    "/dashboard/membership-card",
    "/dashboard/resource-check-in"
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }

  for (const path of [
    "/api/admin/global-operations",
    "/api/organization-units",
    "/api/emergencies",
    "/api/membership-card"
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
  }

  const welfareResponse = await request.post("/api/emergencies/not-an-incident/respond", {
    data: { status: "SAFE" }
  });
  expect(welfareResponse.status()).toBe(401);

  const resourceResponse = await request.post("/api/resources/check-in", {
    data: { token: "00000000-0000-0000-0000-000000000000" }
  });
  expect(resourceResponse.status()).toBe(401);
});

test("form administration, photos, and global log clearing require authentication", async ({ request }) => {
  const complianceDelete = await request.delete("/api/compliance/assignments/not-an-assignment");
  expect(complianceDelete.status()).toBe(401);

  const workspaceResponseEdit = await request.patch("/api/admin/form-responses/not-a-response", {
    data: { answers: {} }
  });
  expect(workspaceResponseEdit.status()).toBe(401);

  const activityClear = await request.delete("/api/admin/activity", {
    data: { confirmation: "CLEAR ALL LETW ACTIVITY" }
  });
  expect(activityClear.status()).toBe(401);

  const photoUpload = await request.post("/api/profile/photo");
  expect(photoUpload.status()).toBe(401);
});

test("unknown digital identity QR codes show a safe invalid result", async ({ page }) => {
  await page.goto("/verify/member/not-a-real-letw-token");
  await expect(page.getByRole("heading", { name: "This LETW.ORG identity is not valid" })).toBeVisible();
  await expect(page.getByText(/do not accept it as proof/i)).toBeVisible();
});

test("authenticated dashboard controls render when test credentials are supplied", async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "E2E credentials are not configured.");
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/collaboration center/i)).toBeVisible();
  await expect(page.getByText(/new workspace/i).first()).toBeVisible();
});
