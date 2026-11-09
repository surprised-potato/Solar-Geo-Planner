import { readFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

const OWNER = { uid: 'alice', email: 'alice@example.com' };
const MEMBER = { uid: 'bob', email: 'bob@example.com' };
const STRANGER = { uid: 'mallory', email: 'mallory@example.com' };

function project(id: string, ownerUid: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    ownerUid,
    name: 'Rooftop',
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    dataJson: '{}',
    zoneCount: 0,
    totalKwp: 0,
    ...extra
  };
}

function db(user: { uid: string; email: string } | null) {
  return user
    ? env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore()
    : env.unauthenticatedContext().firestore();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-solar-geo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'projects', 'p1'), project('p1', OWNER.uid, { memberEmails: [MEMBER.email] }));
    await setDoc(doc(fs, 'projects', 'legacy'), { id: 'legacy', name: 'Old', createdAt: 'x'.repeat(10), updatedAt: 'x'.repeat(10), dataJson: '{}' });
  });
});

describe('unauthenticated clients', () => {
  it('cannot read, list, create or delete', async () => {
    await assertFails(getDoc(doc(db(null), 'projects', 'p1')));
    await assertFails(getDocs(collection(db(null), 'projects')));
    await assertFails(setDoc(doc(db(null), 'projects', 'new'), project('new', 'anyone')));
    await assertFails(deleteDoc(doc(db(null), 'projects', 'p1')));
  });
});

describe('owner', () => {
  it('can create, read, update, share and delete own project', async () => {
    const fs = db(OWNER);
    await assertSucceeds(setDoc(doc(fs, 'projects', 'p2'), project('p2', OWNER.uid)));
    await assertSucceeds(getDoc(doc(fs, 'projects', 'p1')));
    await assertSucceeds(setDoc(doc(fs, 'projects', 'p1'), { name: 'Renamed', ownerUid: OWNER.uid }, { merge: true }));
    await assertSucceeds(updateDoc(doc(fs, 'projects', 'p1'), { memberEmails: ['carol@example.com'] }));
    await assertSucceeds(deleteDoc(doc(fs, 'projects', 'p1')));
  });

  it('can list own projects only with an ownerUid filter', async () => {
    const fs = db(OWNER);
    await assertSucceeds(getDocs(query(collection(fs, 'projects'), where('ownerUid', '==', OWNER.uid))));
    await assertFails(getDocs(collection(fs, 'projects')));
  });

  it('cannot create a project on behalf of someone else', async () => {
    await assertFails(setDoc(doc(db(OWNER), 'projects', 'p3'), project('p3', STRANGER.uid)));
  });

  it('may check whether an unused project ID exists', async () => {
    await assertSucceeds(getDoc(doc(db(OWNER), 'projects', 'does-not-exist')));
  });
});

describe('member', () => {
  it('can read, list shared projects and edit content', async () => {
    const fs = db(MEMBER);
    await assertSucceeds(getDoc(doc(fs, 'projects', 'p1')));
    await assertSucceeds(getDocs(query(collection(fs, 'projects'), where('memberEmails', 'array-contains', MEMBER.email))));
    await assertSucceeds(setDoc(doc(fs, 'projects', 'p1'), { dataJson: '{"v":2}', ownerUid: OWNER.uid }, { merge: true }));
  });

  it('cannot change sharing, ownership or delete', async () => {
    const fs = db(MEMBER);
    await assertFails(updateDoc(doc(fs, 'projects', 'p1'), { memberEmails: [MEMBER.email, STRANGER.email] }));
    await assertFails(updateDoc(doc(fs, 'projects', 'p1'), { ownerUid: MEMBER.uid }));
    await assertFails(deleteDoc(doc(fs, 'projects', 'p1')));
  });

  it('needs a verified email', async () => {
    const unverified = env.authenticatedContext(MEMBER.uid, { email: MEMBER.email, email_verified: false }).firestore();
    await assertFails(getDoc(doc(unverified, 'projects', 'p1')));
  });
});

describe('other signed-in users', () => {
  it('cannot read, list, overwrite or delete projects they were not given', async () => {
    const fs = db(STRANGER);
    await assertFails(getDoc(doc(fs, 'projects', 'p1')));
    await assertFails(getDocs(query(collection(fs, 'projects'), where('ownerUid', '==', OWNER.uid))));
    await assertFails(setDoc(doc(fs, 'projects', 'p1'), project('p1', STRANGER.uid)));
    await assertFails(deleteDoc(doc(fs, 'projects', 'p1')));
  });

  it('cannot read or claim legacy projects without an owner', async () => {
    const fs = db(STRANGER);
    await assertFails(getDoc(doc(fs, 'projects', 'legacy')));
    await assertFails(setDoc(doc(fs, 'projects', 'legacy'), project('legacy', STRANGER.uid)));
  });
});

describe('schema validation', () => {
  it('rejects unknown fields, oversized member lists and mismatched IDs', async () => {
    const fs = db(OWNER);
    await assertFails(setDoc(doc(fs, 'projects', 'p4'), project('p4', OWNER.uid, { isAdmin: true })));
    await assertFails(setDoc(doc(fs, 'projects', 'p5'), project('p5', OWNER.uid, {
      memberEmails: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`)
    })));
    await assertFails(setDoc(doc(fs, 'projects', 'p6'), project('other-id', OWNER.uid)));
  });
});
