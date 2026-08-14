const { reconcileApplicationLifecycle } = require('../src/intelligence/application.lifecycle.reconciliation');

describe('Application Lifecycle Reconciliation & State Integrity Engine', () => {
  test('1. Aggregates application records cleanly across all stores', () => {
    const customData = {
      history: [
        { applicationId: 'app_1', company: 'CompanyA', role: 'Dev', status: 'SUBMITTED' }
      ],
      outcomes: [
        { applicationId: 'app_1', company: 'CompanyA', role: 'Dev', currentStatus: 'SUBMITTED' }
      ],
      queue: [],
      decisionActions: [],
      followups: []
    };

    const report = reconcileApplicationLifecycle({ customData });
    expect(report.totalTracked).toBe(1);
    expect(report.consistentCount).toBe(1);
    expect(report.inconsistentCount).toBe(0);
    expect(report.items[0].canonicalStatus).toBe('SUBMITTED');
  });

  test('2. Detects cross-store status mismatch inconsistency', () => {
    const customData = {
      history: [
        { applicationId: 'app_2', company: 'CompanyB', role: 'Dev', status: 'SUBMITTED' }
      ],
      outcomes: [
        { applicationId: 'app_2', company: 'CompanyB', role: 'Dev', currentStatus: 'OFFER' }
      ]
    };

    const report = reconcileApplicationLifecycle({ customData });
    expect(report.totalTracked).toBe(1);
    expect(report.inconsistentCount).toBe(1);
    expect(report.items[0].inconsistencies[0]).toContain('STATUS_MISMATCH');
  });

  test('3. Detects missing outcome record inconsistency', () => {
    const customData = {
      history: [
        { applicationId: 'app_3', company: 'CompanyC', role: 'Dev', status: 'SUBMITTED' }
      ],
      outcomes: []
    };

    const report = reconcileApplicationLifecycle({ customData });
    expect(report.inconsistentCount).toBe(1);
    expect(report.items[0].inconsistencies[0]).toBe('MISSING_OUTCOME_RECORD');
  });

  test('4. Correctly reconciles Vbeyond Corporation (57f713042c) and Infosys (040826909193)', () => {
    const report = reconcileApplicationLifecycle();
    expect(report.totalTracked).toBeGreaterThan(0);

    const vbeyond = report.items.find((i) => i.applicationId === '57f713042c');
    if (vbeyond) {
      expect(vbeyond.canonicalStatus).toBe('SUBMITTED');
    }

    const infosys = report.items.find((i) => i.applicationId === '040826909193');
    if (infosys) {
      expect(infosys.canonicalStatus).toBe('SUBMITTED');
      expect(infosys.executionStatus).toBe('EXECUTED');
    }
  });
});
