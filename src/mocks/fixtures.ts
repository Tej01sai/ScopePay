// Synthetic demo fixture from INTEGRATION.md. These are demonstration values,
// not customer research, market pricing, or validated user data.

export const demoProject = {
  title: "Portfolio website (synthetic demo)",
  clientName: "Demo Client",
  scopeText:
    "Design five desktop screens for a portfolio website. Includes one revision round. Mobile layouts and extra screens are excluded.",
  hourlyRateDollars: "50.00",
};

export const demoConversation =
  "Please add two mobile layouts for the homepage and contact page. Also change the homepage heading as part of our first revision.";

export const demoUnclearRequest = "Make the design better.";

/** The freelancer's manual estimate for the mobile layouts: 120 min at $50/h = $100.00. */
export const demoEstimate = {
  minutes: 120,
  hourlyRateCents: 5_000,
  expectedTotalCents: 10_000,
};

/** Trigger strings understood only by the mock server, for exercising error states. */
export const mockTriggers = {
  aiError: "[mock-ai-error]",
  providerErrorEmail: "provider-error@example.com",
};
