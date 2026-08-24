/**
 * The sample book.
 *
 * These are claim *inputs* only. No gate, no outcome, no payable figure appears
 * anywhere in this file. Everything the console displays about a decision comes
 * back from the engine over HTTP, which is the point: if the rules change, this
 * file does not, and the screen still tells the truth.
 *
 * Shapes match the published API contract in verdict/api/models.py.
 */

/** Fixes the Code clock so the demo reads the same on any day. */
export const AS_AT = '2026-08-17';

const MOTOR_POLICY = {
  policy_number: 'MTR-88213',
  product: 'Comprehensive Motor',
  pds_version: '2025.11',
  effective_from: '2026-01-01',
  effective_to: '2026-12-31',
  inception: '2024-01-01',
  excess: 750,
};

const COLLISION = { clause_id: '7.2', heading: 'Collision damage', kind: 'insuring' };
const FULL_EVIDENCE = ['claim_form', 'damage_photos', 'repair_quote', 'licence'];

export const MOTOR_CLAIMS = [
  {
    kind: 'motor',
    insured: 'D. Okafor',
    label: 'Clean rear-end collision',
    body: {
      claim_id: 'A10293',
      policy: MOTOR_POLICY,
      date_of_loss: '2026-08-04',
      date_notified: '2026-08-05',
      peril: 'motor_collision',
      narrative: 'Stopped at the lights on Swan Street. The car behind went into my rear bumper.',
      clauses: [COLLISION],
      damage: [{ part: 'rear bumper', severity: 'moderate', confidence: 0.91 }],
      evidence_present: FULL_EVIDENCE,
      quote_total: 2530,
      estimate_high: 2900,
    },
  },
  {
    kind: 'motor',
    insured: 'T. Nguyen',
    label: 'Photo predates the loss',
    body: {
      claim_id: 'A10294',
      policy: { ...MOTOR_POLICY, policy_number: 'MTR-90114' },
      date_of_loss: '2026-08-01',
      date_notified: '2026-08-02',
      peril: 'motor_collision',
      narrative: 'Hit a pole in a car park.',
      clauses: [COLLISION],
      damage: [{ part: 'front bumper', severity: 'light', confidence: 0.88 }],
      integrity: [
        { code: 'PHOTO_PREDATES_LOSS', detail: 'p1.jpg captured 12 Jul, before the stated loss date.', weight: 3 },
        { code: 'DUPLICATE_IMAGE', detail: 'p2.jpg is perceptually identical to p1.jpg.', weight: 2 },
        { code: 'QUOTE_ABOVE_BAND', detail: 'Quote sits 250% above the top of the estimated band.', weight: 2 },
      ],
      evidence_present: FULL_EVIDENCE,
      quote_total: 4900,
      estimate_high: 1400,
    },
  },
  {
    kind: 'motor',
    insured: 'R. Patel',
    label: 'Theft, documents outstanding',
    body: {
      claim_id: 'A10295',
      policy: { ...MOTOR_POLICY, policy_number: 'MTR-77420' },
      date_of_loss: '2026-08-10',
      date_notified: '2026-08-11',
      peril: 'motor_theft',
      narrative: 'Vehicle stolen overnight from the driveway.',
      clauses: [{ clause_id: '8.1', heading: 'Theft of vehicle', kind: 'insuring' }],
      evidence_present: ['claim_form'],
    },
  },
  {
    kind: 'motor',
    insured: 'S. Alvarez',
    label: 'Hardship, window already breached',
    body: {
      claim_id: 'A10287',
      policy: { ...MOTOR_POLICY, policy_number: 'MTR-61208' },
      date_of_loss: '2026-04-02',
      date_notified: '2026-04-06',
      peril: 'motor_collision',
      narrative: 'Side impact at a roundabout. I have not been able to work since.',
      clauses: [COLLISION],
      damage: [{ part: 'driver door', severity: 'moderate', confidence: 0.87 }],
      evidence_present: FULL_EVIDENCE,
      vulnerability_signals: ['financial hardship disclosed in the claimant’s own words'],
      quote_total: 3180,
      estimate_high: 3400,
    },
  },
  {
    kind: 'motor',
    insured: 'K. Brennan',
    label: 'Exclusion applies',
    body: {
      claim_id: 'A10291',
      policy: { ...MOTOR_POLICY, policy_number: 'MTR-52907' },
      date_of_loss: '2026-05-19',
      date_notified: '2026-05-20',
      peril: 'motor_collision',
      narrative: 'Collision on the way home.',
      clauses: [COLLISION, { clause_id: '9.4', heading: 'Driver not licensed', kind: 'exclusion' }],
      damage: [{ part: 'front quarter', severity: 'light', confidence: 0.9 }],
      evidence_present: FULL_EVIDENCE,
      quote_total: 1420,
      estimate_high: 1600,
    },
  },
];

const SILVER = {
  member_number: 'HM-40218',
  fund: 'Southern Health',
  tier: 'silver',
  joined: '2023-01-10',
  product_started: '2023-01-10',
  hospital_excess: 500,
  extras_limits: { dental: 1200, optical: 350 },
  extras_used: { dental: 300, optical: 0 },
};

export const HEALTH_CLAIMS = [
  {
    kind: 'health',
    insured: 'J. Whitfield',
    label: 'Cardiac admission, cover clear',
    body: {
      claim_id: 'H-1001',
      membership: SILVER,
      service: {
        service_type: 'hospital',
        clinical_category: 'heart_and_vascular',
        mbs_items: ['38456'],
        provider_id: 'H0912',
        provider_has_agreement: true,
        charged: 9800,
        medicare_benefit: 2100,
        fund_benefit_scheduled: 6900,
        symptoms_first_noted: '2025-11-02',
      },
      date_of_service: '2026-07-20',
      date_notified: '2026-07-20',
    },
  },
  {
    kind: 'health',
    insured: 'A. Farrugia',
    label: 'Knee replacement on Silver',
    body: {
      claim_id: 'H-1002',
      membership: SILVER,
      service: {
        service_type: 'hospital',
        clinical_category: 'joint_replacements',
        mbs_items: ['49518'],
        provider_id: 'H0912',
        provider_has_agreement: true,
        charged: 22400,
        medicare_benefit: 3900,
        fund_benefit_scheduled: 16800,
        symptoms_first_noted: '2025-08-01',
      },
      date_of_service: '2026-07-22',
      date_notified: '2026-07-22',
    },
  },
  {
    kind: 'health',
    insured: 'M. Osei',
    label: 'Symptoms predate joining',
    body: {
      claim_id: 'H-1003',
      membership: {
        ...SILVER,
        member_number: 'HM-77390',
        tier: 'gold',
        joined: '2026-03-01',
        product_started: '2026-03-01',
        hospital_excess: 250,
      },
      service: {
        service_type: 'hospital',
        clinical_category: 'back_neck_and_spine',
        mbs_items: ['48678'],
        provider_id: 'H2201',
        provider_has_agreement: true,
        charged: 14200,
        medicare_benefit: 2800,
        fund_benefit_scheduled: 10600,
        symptoms_first_noted: '2026-01-18',
      },
      date_of_service: '2026-07-30',
      date_notified: '2026-07-30',
    },
  },
  {
    kind: 'health',
    insured: 'L. Tran',
    label: 'Optical over the annual limit',
    body: {
      claim_id: 'H-1004',
      membership: SILVER,
      service: {
        service_type: 'extras',
        clinical_category: 'optical',
        provider_id: 'O1180',
        charged: 700,
        medicare_benefit: 0,
        fund_benefit_scheduled: 520,
      },
      date_of_service: '2026-08-02',
      date_notified: '2026-08-02',
    },
  },
  {
    kind: 'health',
    insured: 'P. Kaur',
    label: 'Hospital has no agreement',
    body: {
      claim_id: 'H-1005',
      membership: SILVER,
      service: {
        service_type: 'hospital',
        clinical_category: 'digestive_system',
        mbs_items: ['30473'],
        provider_id: 'H8800',
        provider_has_agreement: false,
        charged: 6100,
        medicare_benefit: 1400,
        fund_benefit_scheduled: 3900,
        symptoms_first_noted: '2025-12-01',
      },
      date_of_service: '2026-08-05',
      date_notified: '2026-08-05',
    },
  },
];

export const ALL_CLAIMS = [...MOTOR_CLAIMS, ...HEALTH_CLAIMS];
