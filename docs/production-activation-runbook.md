# Career OS — Production Activation Runbook

## Human Operator Procedure

**Classification**: `P3.40_PRODUCTION_ACTIVATION_RUNBOOK_CERTIFIED`
**Architecture**: P3.36 · P3.37 · P3.38 · P3.39 certified

---

## 1. Purpose

Career OS has been fully certified through Phases P3.36–P3.39. Every governance, enforcement, preflight, runtime, activation, and operator-control safety layer has been verified to be fail-closed.

**The system is `READY_FOR_HUMAN_ACTIVATION`.**

It is **not** automatically active. No automated process, scheduler, governance policy, or runtime start can cross the boundary into production execution without an **explicit, named human operator action**.

This runbook documents the exact procedure a human operator must follow to:

1. Verify all preconditions.
2. Request activation.
3. Approve activation with a valid human identity.
4. Verify the resulting active state.
5. Revoke or return to a safe state.

> **The activation boundary exists precisely to ensure that every production execution decision is a deliberate human choice.**

---

## 2. Preconditions

All of the following must be true before any activation attempt:

### Certification Prerequisites

| Certification | Required |
|---------------|----------|
| `P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED` | YES |
| `P3.37_PRODUCTION_HANDOVER_READY` | YES |
| `P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED` | YES |
| `P3.39_PRODUCTION_OPERATOR_CONTROL_CERTIFIED` | YES |

### Required Operational State

| Parameter | Required Value |
|-----------|---------------|
| Production Readiness | `READY` |
| Handover Status | `READY_FOR_HUMAN_ACTIVATION` |
| Activation Status | `INACTIVE` |
| Activation Gate | `BLOCKED` |
| Execution Permission | `BLOCKED` |
| Operator Approval | `REQUIRED` |
| Governance | `ACTIVE` |
| Enforcement | `ACTIVE` |
| Autonomous Submissions | `BLOCKED` |

If **any** precondition is not met:

```
ACTIVATION BLOCKED — do not proceed
```

---

## 3. Pre-Activation Verification

Run each of the following commands. All must succeed before proceeding.

### Step 3a — Verify P3.36 Integration Certification

```bash
node scripts/audit-phase-p3-36-activation-integration.js
```

Expected final line:
```
P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED
```

### Step 3b — Verify P3.37 Handover Readiness

```bash
node scripts/audit-phase-p3-37-production-handover.js
```

Expected final line:
```
P3.37_PRODUCTION_HANDOVER_READY
```

### Step 3c — Verify P3.38 Controlled Activation Certification

```bash
node scripts/audit-phase-p3-38-controlled-activation.js
```

Expected final line:
```
P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED
```

### Step 3d — Verify Current Operator Control Status

```bash
node scripts/audit-phase-p3-39-production-operator-control.js --status
```

Expected output:
```
Activation Status      : INACTIVE
Activation Gate        : BLOCKED
Execution Permission   : BLOCKED
Autonomous Submissions : BLOCKED
```

### Step 3e — Inspect Full Activation Gate

```bash
node scripts/career-os-production-activation.js --check
```

Verify `Activation Status : INACTIVE` before proceeding.

---

## 4. Human Approval Procedure

### Valid Operator Identity

Only a **valid, explicitly-named human operator** may approve activation.

The following are **unconditionally rejected**:

| Identity | Result |
|----------|--------|
| `""` (empty) | `INVALID_OPERATOR` |
| `"   "` (whitespace) | `INVALID_OPERATOR` |
| `null` / `undefined` | `INVALID_OPERATOR` |
| `"AUTOMATED_SYSTEM"` | `INVALID_OPERATOR` |
| `"SYSTEM"` | `INVALID_OPERATOR` |
| `"AUTOMATION"` | `INVALID_OPERATOR` |
| `"system"` (any case) | `INVALID_OPERATOR` |
| `"automation"` (any case) | `INVALID_OPERATOR` |

The operator identity check is **case-insensitive**.

A valid human operator identity must be:
- A non-empty string
- Not equal to any reserved automated identity (case-insensitively)
- Meaningful — it will be recorded in the activation history

> **Do not create a fake operator identity for production use.**
> Use your actual, auditable human identity (e.g. your name, employee ID, or role handle).

---

## 5. Activation Procedure

### Step 5a — Request Activation

```bash
node scripts/career-os-production-activation.js --request
```

This transitions the state machine:

```
INACTIVE → PENDING_APPROVAL
```

Expected output:
```
Status       : PENDING_APPROVAL
Success      : YES
```

### Step 5b — Approve Activation with Explicit Human Identity

```bash
node scripts/career-os-production-activation.js --approve OPERATOR_NAME --reason "Explicit production approval by OPERATOR_NAME"
```

Replace `OPERATOR_NAME` with your actual human operator identity.

This transitions the state machine:

```
PENDING_APPROVAL → ACTIVE
```

Expected output:
```
Status       : ACTIVE
Approved By  : OPERATOR_NAME
Expires At   : <ISO timestamp, 24 hours from now>
Success      : YES
```

> **A 24-hour TTL is applied automatically.** After expiration the system transitions to `EXPIRED → BLOCKED` without any manual action required.

---

## 6. Active-State Verification

After approval, verify the resulting state:

```bash
node scripts/career-os-production-activation.js --operator-status
```

Expected output:
```
Production Readiness : READY
Handover Status      : READY_FOR_HUMAN_ACTIVATION
Activation Status    : ACTIVE
Activation Gate      : ALLOWED
Execution Permission : ALLOWED
Governance           : ACTIVE
Enforcement          : ACTIVE
Autonomous Submit    : BLOCKED
Operator Approval    : REQUIRED
```

### Critical Distinction

> **`Execution Permission = ALLOWED` does NOT mean `Autonomous Submissions = ALLOWED`.**

These are separate, independent controls:

- `Execution Permission = ALLOWED` — the production activation gate is open. A human operator may explicitly authorize individual career actions through the operator workflow.
- `Autonomous Submissions = BLOCKED` — this is a permanent governance policy. The system **never** submits job applications automatically, regardless of activation state.

Production activation enables **operator-controlled execution** only. It does **not** enable autonomous behavior.

---

## 7. Revocation Procedure

To immediately revoke an active session:

```bash
node scripts/career-os-production-activation.js --revoke OPERATOR_NAME --reason "Reason for revocation"
```

This transitions the state machine:

```
ACTIVE → REVOKED → BLOCKED
```

Expected output:
```
Status       : REVOKED
Success      : YES
```

After revocation, verify:

```bash
node scripts/career-os-production-activation.js --operator-status
```

Expected:
```
Activation Status    : REVOKED
Activation Gate      : BLOCKED
Execution Permission : BLOCKED
```

---

## 8. Expiration Procedure

No manual action is required for expiration. The system automatically transitions:

```
ACTIVE
  ↓  (after 24 hours)
EXPIRED
  ↓
BLOCKED
```

When the TTL shown in `Expires At` has passed, any call to `evaluateCareerOSProductionActivation()` will detect the expired timestamp and return `EXPIRED / BLOCKED`.

To verify expiration has occurred:

```bash
node scripts/career-os-production-activation.js --check
```

Expected after expiration:
```
Activation Status   : EXPIRED
```

After expiration, a new activation requires a fresh `--request` followed by a fresh `--approve` with a valid human operator.

---

## 9. Governance Failure

If governance becomes `INACTIVE` for any reason while production activation is `ACTIVE`, the activation gate is **immediately overridden**:

```
ACTIVE
  +
GOVERNANCE INACTIVE
  ↓
BLOCKED (immediate, fail-closed)
```

This override is automatic and does not require operator action. No external career action can proceed while governance is inactive.

To restore, ensure governance is back to `ACTIVE` state before re-requesting activation.

---

## 10. Emergency Stop

The fastest way to halt all production execution:

```bash
node scripts/career-os-production-activation.js --revoke OPERATOR_NAME --reason "Emergency stop"
```

This immediately transitions:

```
ACTIVE → REVOKED → BLOCKED
```

All execution permission is removed in the same call. No additional commands are needed.

> The existing revocation mechanism is the emergency stop. There is no separate emergency mechanism because revocation is already instantaneous and fail-closed.

---

## 11. Post-Activation Verification

After any production activity, verify the following counters remain at expected values:

```bash
node scripts/career-os-production-activation.js --check
```

Review:
```
Telegram Calls      : 0 (unless explicitly expected for the session)
Playwright Launches : according to explicitly authorized workflow
Applications        : only when explicitly authorized per-decision
External Actions    : only when explicitly authorized per-decision
```

> **Do not perform career submissions, Playwright launches, or Telegram calls during certification or runbook verification.** Those actions are only authorized within explicitly approved operator workflow sessions.

---

## 12. Return-to-Safe-State Procedure

After any production session, return the system to a safe baseline:

### Option A — Revoke (Immediate)

```bash
node scripts/career-os-production-activation.js --revoke OPERATOR_NAME --reason "Session complete"
```

### Option B — Let TTL expire naturally

Wait for the 24-hour TTL to expire. The system transitions automatically to `EXPIRED → BLOCKED`.

### Verify safe state:

```bash
node scripts/audit-phase-p3-39-production-operator-control.js --status
```

Expected:
```
Activation Status      : INACTIVE or REVOKED or EXPIRED
Activation Gate        : BLOCKED
Execution Permission   : BLOCKED
Autonomous Submissions : BLOCKED
```

The system is in a safe state when:

```
Activation Status      ∈ { INACTIVE, REVOKED, EXPIRED }
Execution Permission   = BLOCKED
Autonomous Submissions = BLOCKED
```

---

## Appendix A — Command Reference

| Purpose | Command |
|---------|---------|
| Check current status | `node scripts/career-os-production-activation.js --check` |
| Check operator control | `node scripts/career-os-production-activation.js --operator-status` |
| Request activation | `node scripts/career-os-production-activation.js --request` |
| Approve activation | `node scripts/career-os-production-activation.js --approve NAME --reason "reason"` |
| Revoke activation | `node scripts/career-os-production-activation.js --revoke NAME --reason "reason"` |
| View activation history | `node scripts/career-os-production-activation.js --history` |
| View activation trace | `node scripts/career-os-production-activation.js --trace` |
| P3.39 status check | `node scripts/audit-phase-p3-39-production-operator-control.js --status` |
| P3.40 runbook audit | `node scripts/audit-phase-p3-40-production-runbook.js` |
| Runbook status | `node scripts/audit-phase-p3-40-production-runbook.js --status` |

---

## Appendix B — State Machine Reference

```
INACTIVE
  │  (--request)
  ↓
PENDING_APPROVAL
  │  (--approve OPERATOR)
  ↓
ACTIVE ─── TTL expires ──→ EXPIRED → BLOCKED
  │                                     │
  │  (--revoke OPERATOR)               ↓
  └──────────────────────→ REVOKED → BLOCKED
  │
  +── GOVERNANCE INACTIVE ──→ BLOCKED (override)
```

---

## Appendix C — Safety Invariants (Never Altered)

| Invariant | Status |
|-----------|--------|
| Autonomous submissions | Permanently BLOCKED |
| Ambiguous recovery | Permanently BLOCKED |
| Governance enforcement | Fail-closed |
| Operator approval | Always required |
| TTL | 24 hours maximum |
| Telegram calls (certification) | 0 |
| Playwright launches (certification) | 0 |
| Application submissions (certification) | 0 |
| Core data store mutations (certification) | 0 |
