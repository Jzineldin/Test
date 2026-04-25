// Embedded sample so the demo flow works with a single click.
// Mirrors data/submissions/acme_plumbing.json.

export const ACME_PLUMBING_SUBMISSION = {
  submission_id: "SUB-2026-04-1042",
  received_at: "2026-04-25",
  retail_agent_email: "rachel@bluefin-insurance.example",
  retail_agent_name: "Rachel Ortiz",
  insured: {
    legal_name: "Acme Plumbing Services LLC",
    dba: "Acme Plumbing",
    fein: "47-3829104",
    naics: "238220",
    sic: "1711",
    business_description:
      "Residential and light-commercial plumbing contractor. No new construction. No subcontracted labor. 24/7 emergency service.",
    years_in_business: 14,
    annual_revenue: "4200000",
    employee_count: 22,
    primary_state: "TX",
    mailing_address: "812 W Cesar Chavez St, Austin, TX 78701",
  },
  locations: [
    {
      street: "812 W Cesar Chavez St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      building_value: "1850000",
      contents_value: "320000",
      construction: "Masonry non-combustible",
      year_built: 2004,
      sprinklered: true,
      occupancy: "Office + warehouse",
    },
  ],
  coverages: [
    {
      line: "general_liability",
      limit_per_occurrence: "1000000",
      limit_aggregate: "2000000",
      deductible: "2500",
      effective_date: "2026-06-01",
      expiring_premium: "18400",
    },
    {
      line: "commercial_auto",
      limit_per_occurrence: "1000000",
      deductible: "1000",
      effective_date: "2026-06-01",
      expiring_premium: "20000",
    },
  ],
  loss_history: [
    { policy_year: 2021, line: "general_liability", claim_count: 1, incurred: "4200", paid: "4200", open_reserves: "0" },
    { policy_year: 2022, line: "general_liability", claim_count: 0, incurred: "0", paid: "0", open_reserves: "0" },
    { policy_year: 2023, line: "general_liability", claim_count: 1, incurred: "3850", paid: "3850", open_reserves: "0" },
    { policy_year: 2024, line: "general_liability", claim_count: 0, incurred: "0", paid: "0", open_reserves: "0" },
    { policy_year: 2025, line: "general_liability", claim_count: 0, incurred: "0", paid: "0", open_reserves: "0" },
    { policy_year: 2024, line: "commercial_auto", claim_count: 2, incurred: "14200", paid: "11800", open_reserves: "2400" },
  ],
  notes:
    "Expiring with Acuity. Retail agent is pushing for quote-back inside 10 business days due to renewal date.",
  extra: { fleet: { power_units: 8, drivers: 9, mvr_violations_3y: 1 } },
};
