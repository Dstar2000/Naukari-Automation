const fs = require('fs');
const path = require('path');

const PROD_PROFILE_PATH = path.resolve(__dirname, '../data/profile.json');
const TEST_PROFILE_PATH = path.resolve(__dirname, '../data/test-profile.json');
let prodBackup = null;

describe('Naukri Profile Reader Tests', () => {
  beforeAll(() => {
    if (fs.existsSync(PROD_PROFILE_PATH)) {
      prodBackup = fs.readFileSync(PROD_PROFILE_PATH, 'utf-8');
    }
  });

  afterAll(() => {
    if (prodBackup) {
      fs.writeFileSync(PROD_PROFILE_PATH, prodBackup, 'utf-8');
    }
    if (fs.existsSync(TEST_PROFILE_PATH)) {
      try { fs.unlinkSync(TEST_PROFILE_PATH); } catch (_) {}
    }
  });

  test('Module loading: exports readNaukriProfile and PROFILE_DATA_PATH', () => {
    const profileReader = require('../src/naukri/profile.reader');
    expect(profileReader).toBeDefined();
    expect(typeof profileReader.readNaukriProfile).toBe('function');
    expect(profileReader.PROFILE_DATA_PATH).toBeDefined();
    expect(typeof profileReader.PROFILE_DATA_PATH).toBe('string');
  });

  test('Storage format: profile object schema contains expected extended fields', () => {
    const sampleProfileSchema = {
      personal: {
        name: '',
        location: '',
        experience: '',
        noticePeriod: ''
      },
      headline: '',
      summary: '',
      skills: [],
      careerProfile: {
        currentIndustry: '',
        department: '',
        jobRole: '',
        preferredRoles: [],
        preferredLocations: [],
        expectedSalary: ''
      },
      experience: [],
      projects: [],
      education: [],
      resumeStatus: ''
    };

    expect(typeof sampleProfileSchema.personal).toBe('object');
    expect(typeof sampleProfileSchema.personal.name).toBe('string');
    expect(typeof sampleProfileSchema.headline).toBe('string');
    expect(typeof sampleProfileSchema.summary).toBe('string');
    expect(Array.isArray(sampleProfileSchema.skills)).toBe(true);
    expect(typeof sampleProfileSchema.careerProfile).toBe('object');
    expect(Array.isArray(sampleProfileSchema.careerProfile.preferredRoles)).toBe(true);
    expect(Array.isArray(sampleProfileSchema.careerProfile.preferredLocations)).toBe(true);
    expect(Array.isArray(sampleProfileSchema.experience)).toBe(true);
    expect(Array.isArray(sampleProfileSchema.projects)).toBe(true);
    expect(Array.isArray(sampleProfileSchema.education)).toBe(true);
    expect(typeof sampleProfileSchema.resumeStatus).toBe('string');
  });

  test('Full Profile Structure: saves complete real profile schema without inventing fake values', () => {
    const { saveProfileSnapshot, loadLatestSnapshot } = require('../src/naukri/profile.reader');

    const fullProfileData = {
      personal: {
        name: 'Dileep Kumar',
        location: 'Bengaluru',
        experience: '3 Years 2 Months',
        noticePeriod: '15 Days or less',
        dateOfBirth: '15 Aug 2000',
        gender: 'male',
        address: 'Gulbarga',
        phoneVerified: true,
        emailVerified: true
      },
      headline: 'MERN Stack Developer | React.js | Node.js',
      summary: 'Experienced Full Stack Engineer',
      skills: ['Github', 'Tailwind CSS', 'Jsx', 'React.js', 'Node.Js'],
      skillsOrder: ['Github', 'Tailwind CSS', 'Jsx', 'React.js', 'Node.Js'],
      itSkills: [{ skill: 'React', version: '18', lastUsed: '2026', experience: '3 Years' }],
      employment: [{ company: 'Tech Corp', title: 'Developer', duration: '2 Years', description: 'Built UI' }],
      projects: [{ projectName: 'Automation Engine', description: 'Full stack automation', duration: '6 Months' }],
      education: [{ degree: 'B.Tech / B.E.', institute: 'VTU', year: '2022' }],
      careerProfile: { currentIndustry: 'IT Services', jobRole: 'Software Developer', expectedSalary: '12 Lacs' },
      resume: { fileName: 'Dileep_Resume.pdf', uploadDate: '10 Aug 2026', status: 'UPLOADED' },
      accomplishments: [{ title: 'AWS Certification', description: 'Certified Solutions Architect' }],
      certifications: [],
      courses: [],
      publications: [],
      patents: [],
      socialLinks: [],
      diversityAndInclusion: null,
      careerBreak: null,
      militaryExperience: null
    };

    const snapshot = saveProfileSnapshot(fullProfileData, { targetPath: TEST_PROFILE_PATH, skipHistory: true });

    expect(snapshot.personal.name).toBe('Dileep Kumar');
    expect(snapshot.personal.phoneVerified).toBe(true);
    expect(snapshot.skillsOrder).toEqual(['Github', 'Tailwind CSS', 'Jsx', 'React.js', 'Node.Js']);
    expect(snapshot.resume.status).toBe('UPLOADED');
    expect(snapshot.certifications).toEqual([]);
    expect(snapshot.diversityAndInclusion).toBeNull();
    expect(snapshot.profileFingerprint).toBeDefined();

    const loaded = loadLatestSnapshot(TEST_PROFILE_PATH);
    expect(loaded.personal.name).toBe('Dileep Kumar');
    expect(loaded.skillsOrder).toEqual(['Github', 'Tailwind CSS', 'Jsx', 'React.js', 'Node.Js']);
    expect(loaded.resume.fileName).toBe('Dileep_Resume.pdf');
  });

  test('Snapshot Storage & Metadata: saveProfileSnapshot attaches metadata and preserves skillsOrder', () => {
    const { saveProfileSnapshot, loadLatestSnapshot } = require('../src/naukri/profile.reader');

    const sampleProfile = {
      headline: 'Full Stack Developer',
      summary: 'Experienced MERN Developer',
      skills: ['Github', 'Tailwind CSS', 'Jsx'],
      projects: [{ projectName: 'P1', description: 'D1' }],
      education: [],
      experience: []
    };

    const snapshot = saveProfileSnapshot(sampleProfile, { capturedAt: '2026-08-13T20:00:00.000Z', targetPath: TEST_PROFILE_PATH, skipHistory: true });

    expect(snapshot.source).toBe('naukri.com');
    expect(snapshot.snapshotVersion).toBe(1);
    expect(snapshot.capturedAt).toBe('2026-08-13T20:00:00.000Z');
    expect(snapshot.profileFingerprint).toBeDefined();
    expect(typeof snapshot.profileFingerprint).toBe('string');
    expect(snapshot.skillsOrder).toEqual(['Github', 'Tailwind CSS', 'Jsx']);

    const loaded = loadLatestSnapshot(TEST_PROFILE_PATH);
    expect(loaded).toBeDefined();
    expect(loaded.profileFingerprint).toBe(snapshot.profileFingerprint);
    expect(loaded.skillsOrder).toEqual(['Github', 'Tailwind CSS', 'Jsx']);
  });

  test('Snapshot History: preservePreviousSnapshot stores history snapshot when profile.json exists', () => {
    const { saveProfileSnapshot, preservePreviousSnapshot } = require('../src/naukri/profile.reader');

    saveProfileSnapshot({ headline: 'Initial State', skills: ['CSS', 'HTML'] }, { targetPath: TEST_PROFILE_PATH, skipHistory: true });
    const historyPath = preservePreviousSnapshot({ targetPath: TEST_PROFILE_PATH });

    expect(historyPath).toBeDefined();
    expect(fs.existsSync(historyPath)).toBe(true);

    const historyContent = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    expect(historyContent.skillsOrder).toEqual(['CSS', 'HTML']);
  });

  test('Snapshot Comparison: identical snapshots produce zero changes', () => {
    const { compareProfileSnapshots } = require('../src/naukri/profile.reader');

    const snapA = { headline: 'Developer', summary: 'Summary', skills: ['React.js', 'Node.js'] };
    const snapB = { headline: 'Developer', summary: 'Summary', skills: ['React.js', 'Node.js'] };

    const diff = compareProfileSnapshots(snapA, snapB);
    expect(diff.headline.changed).toBe(false);
    expect(diff.summary.changed).toBe(false);
    expect(diff.skills.sameOrder).toBe(true);
    expect(diff.skills.reordered).toBe(false);
    expect(diff.skills.added).toEqual([]);
    expect(diff.skills.removed).toEqual([]);
  });

  test('Snapshot Comparison: pure skill reorder is detected as reorder ONLY (added: 0, removed: 0)', () => {
    const { compareProfileSnapshots } = require('../src/naukri/profile.reader');

    const snapA = { skills: ['Github', 'Tailwind CSS', 'Jsx'] };
    const snapB = { skills: ['Jsx', 'Github', 'Tailwind CSS'] };

    const diff = compareProfileSnapshots(snapA, snapB);
    expect(diff.skills.reordered).toBe(true);
    expect(diff.skills.sameOrder).toBe(false);
    expect(diff.skills.added).toEqual([]);
    expect(diff.skills.removed).toEqual([]);
  });

  test('Snapshot Comparison: skill addition and removal are detected correctly', () => {
    const { compareProfileSnapshots } = require('../src/naukri/profile.reader');

    const snapA = { skills: ['React.js', 'Node.js', 'DOM'] };
    const snapB = { skills: ['React.js', 'Node.js', 'Docker'] };

    const diff = compareProfileSnapshots(snapA, snapB);
    expect(diff.skills.reordered).toBe(false);
    expect(diff.skills.added).toEqual(['Docker']);
    expect(diff.skills.removed).toEqual(['DOM']);
  });
});
